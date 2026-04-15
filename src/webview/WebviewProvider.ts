import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getWebviewContent } from './getWebviewContent';
import { ClaudeClient } from '../claude/ClaudeClient';
import { FileContext } from '../context/FileContext';
import { MentionParser } from '../context/MentionParser';
import { SessionManager, type Session } from '../sessions/SessionManager';
import { StatusBarManager } from '../statusBar';

type PermissionMode = 'default' | 'acceptEdits' | 'plan';

/** Messages sent from the webview to the extension host */
interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Manages Ryan's Claude Code webview panels (sidebar view + editor tab panels).
 * Each panel and the sidebar maintain independent conversation sessions.
 */
export class WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ccrSidebarView';

  private view?: vscode.WebviewView;
  private panels = new Set<vscode.WebviewPanel>();

  /** Per-webview session tracking — each tab/sidebar has its own conversation */
  private sessionByWebview = new Map<vscode.Webview, Session | undefined>();

  private sessionManager: SessionManager;
  private statusBar: StatusBarManager;
  private pendingPermissionResolvers = new Map<string, (approved: boolean) => void>();
  private pendingCleanups = new Map<string, () => Promise<void>>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    statusBar: StatusBarManager
  ) {
    this.sessionManager = new SessionManager();
    this.statusBar = statusBar;
  }

  // ─── WebviewViewProvider implementation ───────────────────────────────────

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.configureWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) =>
      this.handleMessage(msg, webviewView.webview)
    );
  }

  // ─── Panel management ──────────────────────────────────────────────────────

  /** Open (or focus the most recent) editor tab panel. */
  createOrShowPanel(): void {
    const existing = [...this.panels].pop();
    if (existing) {
      existing.reveal();
      return;
    }
    this.createNewPanel();
  }

  /** Always create a brand-new editor tab with a fresh conversation. */
  createNewPanel(column = vscode.ViewColumn.Beside): void {
    const panel = vscode.window.createWebviewPanel(
      'claudeCodeReplicaPanel',
      `Ryan's Claude Code`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'resources'),
        ],
        retainContextWhenHidden: true,
      }
    );

    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'claude-logo.svg');
    this.configureWebview(panel.webview);

    panel.webview.onDidReceiveMessage((msg: WebviewMessage) =>
      this.handleMessage(msg, panel.webview)
    );

    panel.onDidDispose(() => {
      this.panels.delete(panel);
      this.sessionByWebview.delete(panel.webview);
    });

    this.panels.add(panel);
  }

  // ─── Focus / blur helpers ──────────────────────────────────────────────────

  /** Re-send the init message (e.g. after API key is set in settings). */
  sendInit(): void {
    const config = vscode.workspace.getConfiguration('claudeCodeReplica');
    const hasApiKey = !!(config.get<string>('apiKey') || '').trim();
    const model = config.get<string>('model') ?? 'claude-sonnet-4-6';
    const mode = config.get<PermissionMode>('initialPermissionMode') ?? 'default';
    const useCtrlEnter = config.get<boolean>('useCtrlEnterToSend') ?? false;
    const msg = { type: 'init', hasApiKey, model, mode, useCtrlEnter };
    for (const panel of this.panels) {
      panel.webview.postMessage(msg).then(undefined, () => {});
    }
    this.view?.webview.postMessage(msg).then(undefined, () => {});
  }

  focusInput(): void {
    this.postToActive({ type: 'focus' });
  }

  blurInput(): void {
    this.postToActive({ type: 'blur' });
  }

  /** Called by the newConversation command — opens a new tab. */
  startNewConversation(): void {
    this.createNewPanel();
  }

  insertMention(): void {
    const ctx = FileContext.getCurrent();
    if (ctx.relativePath) {
      const mention = ctx.selection
        ? `@${ctx.relativePath}#L${ctx.selection.startLine}-${ctx.selection.endLine}`
        : `@${ctx.relativePath}`;
      this.postToActive({ type: 'insertMention', mention });
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private configureWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'resources'),
      ],
    };
    webview.html = getWebviewContent(webview, this.extensionUri);
  }

  /** Post a message to whichever surface is most recently active. */
  private postToActive(message: object): void {
    const lastPanel = [...this.panels].pop();
    if (lastPanel) {
      lastPanel.webview.postMessage(message).then(undefined, () => {});
    } else if (this.view) {
      this.view.webview.postMessage(message).then(undefined, () => {});
    }
  }

  // ─── Message handler ───────────────────────────────────────────────────────

  private async handleMessage(msg: WebviewMessage, webview: vscode.Webview): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.onReady(webview);
        break;

      case 'sendMessage':
        await this.onSendMessage(msg.text as string, msg.mode as PermissionMode, webview);
        break;

      case 'newConversation':
        // Open a fresh tab in the same column; the current tab stays as-is
        this.createNewPanel(vscode.ViewColumn.Active);
        break;

      case 'loadSession':
        await this.onLoadSession(msg.id as string, webview);
        break;

      case 'deleteSession':
        this.sessionManager.deleteSession(msg.id as string);
        webview.postMessage({ type: 'sessionDeleted', id: msg.id }).then(undefined, () => {});
        break;

      case 'renameSession':
        this.sessionManager.renameSession(msg.id as string, msg.title as string);
        break;

      case 'getSessionList':
        await this.onGetSessionList(webview);
        break;

      case 'findFiles':
        await this.onFindFiles(msg.query as string, webview);
        break;

      case 'permissionResponse':
      case 'editApprovalResponse':
        this.onPermissionResponse(msg.requestId as string, msg.approved as boolean);
        break;

      case 'openFile':
        await this.onOpenFile(msg.path as string);
        break;

      case 'rejectEdit': {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const absPath = require('path').join(workspaceRoot, msg.path as string);
          await FileContext.applyEdit(absPath, msg.oldContent as string);
        }
        break;
      }

      case 'getEditorContext':
        this.onGetEditorContext(webview);
        break;

      case 'openSettings':
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'claudeCodeReplica.apiKey'
        );
        break;

      case 'logout': {
        // Clear the stored API key and show the login screen
        const config = vscode.workspace.getConfiguration('claudeCodeReplica');
        await config.update('apiKey', '', vscode.ConfigurationTarget.Global);
        webview.postMessage({ type: 'showLoginScreen' }).then(undefined, () => {});
        break;
      }

      case 'openUrl':
        vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
        break;

      case 'planAccepted':
        await this.onPlanAccepted(
          msg.action as 'autoAccept' | 'manualApprove' | 'keepPlanning',
          msg.originalRequest as string,
          msg.feedback as string | undefined,
          webview
        );
        break;
    }
  }

  private async onReady(webview: vscode.Webview): Promise<void> {
    const config = vscode.workspace.getConfiguration('claudeCodeReplica');
    const hasApiKey = !!(config.get<string>('apiKey') || '').trim();
    const model = config.get<string>('model') ?? 'claude-sonnet-4-6';
    const mode = config.get<PermissionMode>('initialPermissionMode') ?? 'default';
    const useCtrlEnter = config.get<boolean>('useCtrlEnterToSend') ?? false;

    webview.postMessage({ type: 'init', hasApiKey, model, mode, useCtrlEnter }).then(undefined, () => {});
    this.onGetEditorContext(webview);
  }

  private onGetEditorContext(webview: vscode.Webview): void {
    const ctx = FileContext.getCurrent();
    webview.postMessage({
      type: 'editorContext',
      context: {
        file: ctx.relativePath,
        language: ctx.language,
        hasSelection: !!ctx.selection,
        selectionLines: ctx.selection
          ? `${ctx.selection.startLine}-${ctx.selection.endLine}`
          : null,
      },
    }).then(undefined, () => {});
  }

  private async onSendMessage(
    rawText: string,
    permissionMode: PermissionMode,
    webview: vscode.Webview
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('claudeCodeReplica');
    const apiKey = (config.get<string>('apiKey') ?? '').trim();
    const model = config.get<string>('model') ?? 'claude-sonnet-4-6';

    if (!apiKey) {
      webview.postMessage({
        type: 'error',
        message: 'No API key configured. Open Settings (Ctrl+,) and set `claudeCodeReplica.apiKey`.',
      }).then(undefined, () => {});
      return;
    }

    // Resolve @-mentions
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let messageText = rawText;
    if (workspaceRoot) {
      const mentions = MentionParser.extractMentions(rawText);
      if (mentions.length) {
        const resolved = await MentionParser.resolveMentions(mentions, workspaceRoot);
        const contextBlock = MentionParser.buildContextBlock(resolved);
        if (contextBlock) {
          messageText = `${contextBlock}\n\n${rawText}`;
        }
      }
    }

    // Ensure session exists for this webview
    let session = this.sessionByWebview.get(webview);
    if (!session) {
      session = this.sessionManager.createSession(model);
      this.sessionByWebview.set(webview, session);
    }

    // Add user message
    session.messages.push({ role: 'user', content: messageText, timestamp: Date.now() });

    const isFirstMessage = session.messages.filter((m) => m.role === 'user').length === 1;

    this.sessionManager.saveSession(session);

    const editorCtx = FileContext.getCurrent();
    const systemPrompt = FileContext.buildSystemPrompt(editorCtx, permissionMode);

    this.statusBar.setThinking();
    webview.postMessage({ type: 'assistantStart', sessionId: session.id }).then(undefined, () => {});

    const client = new ClaudeClient(apiKey, model);
    let assistantText = '';

    await client.streamChat(session.messages, systemPrompt, permissionMode, {
      onToken: (text) => {
        assistantText += text;
        webview.postMessage({ type: 'token', text }).then(undefined, () => {});
      },

      onToolCallStart: (toolName, toolId, input) => {
        webview.postMessage({ type: 'toolCallStart', toolName, toolId, input }).then(undefined, () => {});
        this.statusBar.setThinking();
      },

      onToolCallEnd: (toolId, output, isError, diff) => {
        webview.postMessage({ type: 'toolCallEnd', toolId, output, isError, diff }).then(undefined, () => {});
      },

      onError: (error) => {
        webview.postMessage({ type: 'error', message: error }).then(undefined, () => {});
        this.statusBar.setIdle();
      },

      onDone: (inputTokens, outputTokens) => {
        if (session && assistantText) {
          session.messages.push({ role: 'assistant', content: assistantText, timestamp: Date.now() });
          this.sessionManager.saveSession(session);
        }
        webview.postMessage({ type: 'assistantDone', inputTokens, outputTokens }).then(undefined, () => {});
        this.statusBar.setIdle();

        // In plan mode, open the plan as a document beside Claude
        if (permissionMode === 'plan' && assistantText) {
          this.openPlanDocument(assistantText, rawText).then(() => {
            webview.postMessage({ type: 'planReady', planText: assistantText, originalRequest: rawText }).then(undefined, () => {});
          }).catch(() => {
            webview.postMessage({ type: 'planReady', planText: assistantText, originalRequest: rawText }).then(undefined, () => {});
          });
        }

        // Generate an AI title after the first exchange
        if (isFirstMessage && session && assistantText) {
          client.generateTitle(rawText, assistantText).then((title) => {
            if (!session) return;
            session.title = title;
            this.sessionManager.saveSession(session);
            webview.postMessage({ type: 'sessionTitle', title }).then(undefined, () => {});
            const owningPanel = [...this.panels].find((p) => p.webview === webview);
            if (owningPanel) owningPanel.title = title;
          }).catch(() => {});
        }
      },

      onPermissionRequest: async (message) => {
        const requestId = `perm_${Date.now()}`;
        if (message.startsWith('__EDIT_DIFF__')) {
          const diff = JSON.parse(message.slice('__EDIT_DIFF__'.length));
          const wRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
          const realFilePath = path.join(wRoot, diff.path);

          // Both sides of the diff must be real files on disk — VS Code's diff
          // command cannot handle URIs that don't exist.  Write both to tmpdir
          // so the workspace file watcher never sees them.
          const baseName = path.basename(diff.path);
          const tmpOrig    = path.join(os.tmpdir(), `claude-orig-${requestId}-${baseName}`);
          const tmpPreview = path.join(os.tmpdir(), `claude-preview-${requestId}-${baseName}`);

          // Read original content (empty string for new files)
          let origContent = '';
          try { origContent = await fs.readFile(realFilePath, 'utf-8'); } catch { /* new file */ }

          await fs.writeFile(tmpOrig,    origContent,     'utf-8');
          await fs.writeFile(tmpPreview, diff.newContent, 'utf-8');

          const origUri    = vscode.Uri.file(tmpOrig);
          const previewUri = vscode.Uri.file(tmpPreview);

          await vscode.commands.executeCommand(
            'vscode.diff',
            origUri,
            previewUri,
            `Claude proposed edit: ${diff.path}`,
            { preview: true, viewColumn: vscode.ViewColumn.One }
          );

          // Cleanup: close the diff tab and delete both temp files
          this.pendingCleanups.set(requestId, async () => {
            try { await fs.unlink(tmpOrig); }    catch {}
            try { await fs.unlink(tmpPreview); } catch {}
            for (const group of vscode.window.tabGroups.all) {
              for (const tab of group.tabs) {
                const input = tab.input as { original?: vscode.Uri; modified?: vscode.Uri } | undefined;
                if (input?.modified?.fsPath === tmpPreview || input?.original?.fsPath === tmpOrig) {
                  await vscode.window.tabGroups.close(tab);
                }
              }
            }
          });

          webview.postMessage({ type: 'editPermissionRequest', requestId, path: diff.path, description: diff.description }).then(undefined, () => {});
        } else {
          webview.postMessage({ type: 'permissionRequest', requestId, message }).then(undefined, () => {});
        }
        this.statusBar.setPendingPermission();
        return new Promise<boolean>((resolve) => {
          this.pendingPermissionResolvers.set(requestId, resolve);
        });
      },
    });
  }

  private async onLoadSession(id: string, webview: vscode.Webview): Promise<void> {
    const session = this.sessionManager.loadSession(id);
    if (!session) {
      webview.postMessage({ type: 'error', message: 'Session not found.' }).then(undefined, () => {});
      return;
    }
    this.sessionByWebview.set(webview, session);
    webview.postMessage({ type: 'sessionLoaded', session }).then(undefined, () => {});
  }

  private async onGetSessionList(webview: vscode.Webview): Promise<void> {
    const sessions = this.sessionManager.listSessions();
    const groups = SessionManager.groupByDate(sessions);
    webview.postMessage({ type: 'sessionList', groups }).then(undefined, () => {});
  }

  private async onFindFiles(query: string, webview: vscode.Webview): Promise<void> {
    const files = await MentionParser.findMatchingFiles(query);
    webview.postMessage({ type: 'fileList', files }).then(undefined, () => {});
  }

  private onPermissionResponse(requestId: string, approved: boolean): void {
    const resolver = this.pendingPermissionResolvers.get(requestId);
    if (resolver) {
      this.pendingPermissionResolvers.delete(requestId);
      resolver(approved);
      this.statusBar.setThinking();
      const cleanup = this.pendingCleanups.get(requestId);
      if (cleanup) {
        this.pendingCleanups.delete(requestId);
        cleanup().catch(() => {});
      }
    }
  }

  private async onOpenFile(relativePath: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;
    const absPath = require('path').join(workspaceRoot, relativePath);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    await vscode.window.showTextDocument(doc);
  }

  private async openPlanDocument(planText: string, originalRequest: string): Promise<void> {
    const title = `Plan: ${originalRequest.slice(0, 40).replace(/\n/g, ' ')}${originalRequest.length > 40 ? '…' : ''}`;

    const panel = vscode.window.createWebviewPanel(
      'claudePlanView',
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const rendered = this.renderPlanHtml(planText, title);
    panel.webview.html = rendered;

    // Forward selection comments back to the originating Claude webview
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'planComment' && msg.comment) {
        // Inject the comment into the active Claude webview's feedback field
        for (const p of this.panels) {
          p.webview.postMessage({ type: 'planComment', comment: msg.comment, selection: msg.selection }).then(undefined, () => {});
        }
        this.view?.webview.postMessage({ type: 'planComment', comment: msg.comment, selection: msg.selection }).then(undefined, () => {});
      }
    });
  }

  private renderPlanHtml(planText: string, title: string): string {
    // Convert markdown to basic HTML for the plan view
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = escHtml(planText)
      // headings
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // bold / italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // code blocks
      .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // horizontal rules
      .replace(/^---+$/gm, '<hr/>')
      // numbered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // bullet lists
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>')
      // wrap li runs
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, -apple-system, 'Segoe UI', sans-serif);
    font-size: 14px;
    line-height: 1.7;
    color: var(--vscode-editor-foreground, #cccccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 32px 48px 64px;
    max-width: 780px;
    margin: 0 auto;
  }
  .ready-box {
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 36px;
  }
  .ready-box strong { font-size: 14px; display: block; margin-bottom: 3px; }
  .ready-box span { font-size: 12px; opacity: 0.55; }
  h1 { font-size: 28px; font-weight: 700; margin: 24px 0 10px; }
  h2 { font-size: 18px; font-weight: 600; margin: 28px 0 8px; }
  h3 { font-size: 15px; font-weight: 600; margin: 20px 0 6px; }
  h1 + hr, h2 + hr, h3 + hr { margin: 6px 0 14px; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0; }
  p { margin: 10px 0; }
  ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; }
  code {
    font-family: var(--vscode-editor-font-family, 'Cascadia Code', monospace);
    font-size: 12.5px;
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 1px 5px;
    color: #ce9178;
  }
  pre {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 12px 0;
  }
  pre code { background: none; padding: 0; color: #9cdcfe; }
  ::selection { background: rgba(59,130,246,0.35); }

  /* Comment popover */
  #comment-popup {
    position: fixed;
    display: none;
    flex-direction: column;
    gap: 6px;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 10px;
    width: 260px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    z-index: 100;
  }
  #comment-popup.visible { display: flex; }
  #comment-input {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    color: var(--vscode-editor-foreground, #ccc);
    font-family: inherit;
    font-size: 12px;
    padding: 7px 9px;
    resize: none;
    outline: none;
    width: 100%;
  }
  #comment-input:focus { border-color: rgba(255,255,255,0.25); }
  #comment-submit {
    align-self: flex-end;
    background: #3b82f6;
    border: none;
    border-radius: 5px;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
  }
  #comment-submit:hover { background: #2563eb; }
</style>
</head>
<body>

<div class="ready-box">
  <strong>Ready for review</strong>
  <span>Select text to add comments on the plan</span>
</div>

<p>${html}</p>

<div id="comment-popup">
  <textarea id="comment-input" rows="3" placeholder="Add a comment on the selected text…"></textarea>
  <button id="comment-submit">Add comment</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const popup = document.getElementById('comment-popup');
  const commentInput = document.getElementById('comment-input');
  const commentSubmit = document.getElementById('comment-submit');
  let pendingSelection = '';

  document.addEventListener('mouseup', () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text) { popup.classList.remove('visible'); return; }

    pendingSelection = text;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popup.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
    popup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    popup.classList.add('visible');
    commentInput.focus();
  });

  commentSubmit.addEventListener('click', submitComment);
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
    if (e.key === 'Escape') { popup.classList.remove('visible'); }
  });

  function submitComment() {
    const comment = commentInput.value.trim();
    if (!comment) return;
    vscode.postMessage({ type: 'planComment', comment, selection: pendingSelection });
    commentInput.value = '';
    popup.classList.remove('visible');
    window.getSelection()?.removeAllRanges();
  }
</script>
</body>
</html>`;
  }

  private async onPlanAccepted(
    action: 'autoAccept' | 'manualApprove' | 'keepPlanning',
    originalRequest: string,
    feedback: string | undefined,
    webview: vscode.Webview
  ): Promise<void> {
    if (action === 'keepPlanning') {
      const followUp = feedback?.trim() || originalRequest;
      await this.onSendMessage(followUp, 'plan', webview);
    } else {
      const newMode = action === 'autoAccept' ? 'acceptEdits' : 'default';
      await this.onSendMessage(originalRequest, newMode, webview);
    }
  }
}

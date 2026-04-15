import * as vscode from 'vscode';
import { WebviewProvider } from './webview/WebviewProvider';
import { StatusBarManager } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager(context);
  const provider = new WebviewProvider(context.extensionUri, context, statusBar);

  // Register the sidebar webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      WebviewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ─── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.sidebar.open', () => {
      vscode.commands.executeCommand('ccrSidebarView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.editor.open', () => {
      provider.createOrShowPanel();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.newConversation', () => {
      provider.startNewConversation();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.focus', () => {
      provider.focusInput();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.blur', () => {
      provider.blurInput();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.insertMention', () => {
      provider.insertMention();
      // Also ensure the panel is visible
      const config = vscode.workspace.getConfiguration('claudeCodeReplica');
      const preferred = config.get<string>('preferredLocation') ?? 'sidebar';
      if (preferred === 'panel') {
        provider.createOrShowPanel();
      } else {
        vscode.commands.executeCommand('ccrSidebarView.focus');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.logout', () => {
      const config = vscode.workspace.getConfiguration('claudeCodeReplica');
      config.update('apiKey', '', vscode.ConfigurationTarget.Global).then(() => {
        vscode.window.showInformationMessage(`Ryan's Claude Code: API key cleared.`);
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.showLogs', () => {
      vscode.commands.executeCommand('workbench.action.toggleDevTools');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.openWalkthrough', () => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'replica.claude-code-replica#claude-code-replica-walkthrough',
        false
      );
    })
  );

  // Accept/Reject diff commands (stubs — handled in webview)
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.acceptDiff', () => {
      // Handled by the webview via message passing
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-code-replica.rejectDiff', () => {
      // Handled by the webview via message passing
    })
  );

  // ─── React to active editor changes ───────────────────────────────────────

  // Refresh webview when API key or model changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeCodeReplica.apiKey') ||
          e.affectsConfiguration('claudeCodeReplica.model')) {
        provider.sendInit();
      }
    })
  );
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions
}

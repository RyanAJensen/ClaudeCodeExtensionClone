// @ts-check
/// <reference lib="dom" />

// Acquire VS Code API (singleton)
const vscode = acquireVsCodeApi();

// ─── State ──────────────────────────────────────────────────
let isStreaming = false;
let currentMode = 'default';
let useCtrlEnter = false;
let currentSessionId = null;
let streamingEl = null; // the currently streaming .message element
let totalInputTokens = 0;
let totalOutputTokens = 0;
let editorContext = null;
let assistantStartTime = null;
let firstTokenReceived = false;
let wordRotationInterval = null;
let currentThinkingWord = 'Thinking';

const THINKING_WORDS = [
  "Accomplishing","Actioning","Actualizing","Architecting","Baking","Beaming",
  "Beboppin'","Befuddling","Billowing","Blanching","Bloviating","Boogieing",
  "Boondoggling","Booping","Bootstrapping","Brewing","Bunning","Burrowing",
  "Calculating","Canoodling","Caramelizing","Cascading","Catapulting","Cerebrating",
  "Channeling","Channelling","Choreographing","Churning","Clauding","Coalescing",
  "Cogitating","Combobulating","Composing","Computing","Concocting","Considering",
  "Contemplating","Cooking","Crafting","Creating","Crunching","Crystallizing",
  "Cultivating","Deciphering","Deliberating","Determining","Dilly-dallying",
  "Discombobulating","Doing","Doodling","Drizzling","Ebbing","Effecting",
  "Elucidating","Embellishing","Enchanting","Envisioning","Evaporating","Fermenting",
  "Fiddle-faddling","Finagling","Flambéing","Flibbertigibbeting","Flowing","Flummoxing",
  "Fluttering","Forging","Forming","Frolicking","Frosting","Gallivanting","Galloping",
  "Garnishing","Generating","Gesticulating","Germinating","Gitifying","Grooving",
  "Gusting","Harmonizing","Hashing","Hatching","Herding","Honking","Hullaballooing",
  "Hyperspacing","Ideating","Imagining","Improvising","Incubating","Inferring",
  "Infusing","Ionizing","Jitterbugging","Julienning","Kneading","Leavening",
  "Levitating","Lollygagging","Manifesting","Marinating","Meandering","Metamorphosing",
  "Misting","Moonwalking","Moseying","Mulling","Mustering","Musing","Nebulizing",
  "Nesting","Newspapering","Noodling","Nucleating","Orbiting","Orchestrating",
  "Osmosing","Perambulating","Percolating","Perusing","Philosophising",
  "Photosynthesizing","Pollinating","Pondering","Pontificating","Pouncing",
  "Precipitating","Prestidigitating","Processing","Proofing","Propagating","Puttering",
  "Puzzling","Quantumizing","Razzle-dazzling","Razzmatazzing","Recombobulating",
  "Reticulating","Roosting","Ruminating","Sautéing","Scampering","Schlepping",
  "Scurrying","Seasoning","Shenaniganing","Shimmying","Simmering","Skedaddling",
  "Sketching","Slithering","Smooshing","Sock-hopping","Spelunking","Spinning",
  "Sprouting","Stewing","Sublimating","Swirling","Swooping","Symbioting",
  "Synthesizing","Tempering","Thinking","Thundering","Tinkering","Tomfoolering",
  "Topsy-turvying","Transfiguring","Transmuting","Twisting","Undulating","Unfurling",
  "Unravelling","Vibing","Waddling","Wandering","Warping","Whatchamacalliting",
  "Whirlpooling","Whirring","Whisking","Wibbling","Working","Wrangling","Zesting",
  "Zigzagging"
];

function pickThinkingWord() {
  return THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)];
}

// Slash command definitions
const SLASH_COMMANDS = [
  { name: '/help',     icon: '?',  desc: 'Show available commands and shortcuts' },
  { name: '/clear',    icon: '✕',  desc: 'Clear the current conversation' },
  { name: '/model',    icon: '◎',  desc: 'Show current model info' },
  { name: '/compact',  icon: '⇲',  desc: 'Compact conversation to save context' },
  { name: '/context',  icon: '📊', desc: 'Show context window usage' },
  { name: '/resume',   icon: '↩',  desc: 'Browse and resume a past session' },
];

// ─── DOM Refs ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const loginScreen    = $('#login-screen');
const header         = $('#header');
const inputFooter    = $('#input-footer');
const inputContainer = $('#input-container');
const messagesEl     = $('#messages');
const chatArea       = $('#chat-area');
const inputEl        = $('#input');
const btnSend        = $('#btn-send');
const btnNew         = $('#btn-new');
const btnSessions    = $('#btn-sessions');
const sessionTitle   = $('#session-title');
const sessionsPanel  = $('#sessions-panel');
const sessionsList   = $('#sessions-list');
const sessionsSearch = $('#sessions-search');
const welcomeScreen  = $('#welcome-screen');
const mentionMenu    = $('#mention-menu');
const slashMenu      = $('#slash-menu');
const btnMode        = $('#btn-mode');
const modeMenu       = $('#mode-menu');
const modeLabel      = $('#mode-label');
const modeIcon       = $('#mode-icon');
const ctxIndicator   = $('#ctx-indicator');
const statusText     = $('#status-text');
const permDialog     = $('#permission-dialog');
const permMessage    = $('#permission-dialog-message');
const btnApprove     = $('#btn-approve');
const btnReject      = $('#btn-reject');
const planDialog     = $('#plan-dialog');
const planFeedback   = $('#plan-feedback');
const editApprovalDialog  = $('#edit-approval-dialog');
const editApprovalPath    = $('#edit-approval-path');
const editApprovalDesc    = $('#edit-approval-desc');
const editApprovalFeedback = $('#edit-approval-feedback');

let pendingPlanRequest = null; // { originalRequest }
let pendingEditRequest = null; // { requestId }

// ─── Init ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Start in login screen state — the init message will determine which to show
  vscode.postMessage({ type: 'ready' });
  vscode.postMessage({ type: 'getSessionList' });

  // Login screen button handlers
  $('#btn-login-subscription').addEventListener('click', () => {
    vscode.postMessage({ type: 'openUrl', url: 'https://claude.ai' });
    vscode.postMessage({ type: 'openSettings' });
  });
  $('#btn-login-console').addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
  });
  $('#btn-login-providers').addEventListener('click', () => {
    vscode.postMessage({ type: 'openUrl', url: 'https://docs.anthropic.com/en/docs/about-claude/models/overview' });
    vscode.postMessage({ type: 'openSettings' });
  });

  // Logout button
  $('#btn-logout').addEventListener('click', () => {
    vscode.postMessage({ type: 'logout' });
  });
});

// ─── VS Code → Webview messages ─────────────────────────────
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
      useCtrlEnter = msg.useCtrlEnter;
      setMode(msg.mode || 'default');
      if (msg.hasApiKey) {
        showChatScreen();
      } else {
        showLoginScreen();
      }
      updateSendHint();
      break;

    case 'editorContext':
      editorContext = msg.context;
      updateEditorContextIndicator();
      break;

    case 'token':
      appendToken(msg.text);
      break;

    case 'sessionTitle':
      sessionTitle.textContent = msg.title;
      break;

    case 'assistantStart':
      currentSessionId = msg.sessionId;
      assistantStartTime = Date.now();
      firstTokenReceived = false;
      startAssistantMessage();
      break;

    case 'assistantDone':
      finalizeAssistantMessage(msg.inputTokens, msg.outputTokens);
      break;

    case 'planReady':
      pendingPlanRequest = { originalRequest: msg.originalRequest };
      planFeedback.value = '';
      planDialog.classList.remove('hidden');
      break;

    case 'planComment':
      if (!planDialog.classList.contains('hidden')) {
        const existing = planFeedback.value.trim();
        const annotation = msg.selection ? `"${msg.selection}": ${msg.comment}` : msg.comment;
        planFeedback.value = existing ? `${existing}\n${annotation}` : annotation;
      }
      break;

    case 'toolCallStart':
      appendToolCall(msg.toolName, msg.toolId, msg.input);
      break;

    case 'toolCallEnd':
      finalizeToolCall(msg.toolId, msg.output, msg.isError, msg.diff);
      break;

    case 'error':
      showError(msg.message);
      break;

    case 'sessionList':
      renderSessionList(msg.groups, '');
      break;

    case 'sessionLoaded':
      loadSession(msg.session);
      break;

    case 'sessionDeleted':
      vscode.postMessage({ type: 'getSessionList' });
      break;

    case 'conversationCleared':
      clearConversation();
      break;

    case 'newConversation':
      clearConversation();
      break;

    case 'fileList':
      renderMentionMenu(msg.files);
      break;

    case 'insertMention':
      insertTextAtCursor(msg.mention + ' ');
      break;

    case 'permissionRequest':
      showPermissionDialog(msg.requestId, msg.message);
      break;

    case 'editPermissionRequest':
      showEditApprovalDialog(msg.requestId, msg.path, msg.description);
      break;

    case 'showLoginScreen':
      showLoginScreen();
      break;

    case 'focus':
      inputEl.focus();
      break;

    case 'blur':
      inputEl.blur();
      break;
  }
});

// ─── Input events ────────────────────────────────────────────
inputEl.addEventListener('input', () => {
  autoResizeTextarea();
  handleInputChange();
});

inputEl.addEventListener('keydown', (e) => {
  // Close dropdowns on Escape
  if (e.key === 'Escape') {
    closeAllMenus();
    return;
  }

  // Navigate autocomplete menus
  if (mentionMenu.children.length > 0 && !mentionMenu.classList.contains('hidden')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      navigateMenu(mentionMenu, e.key);
      return;
    }
  }
  if (slashMenu.children.length > 0 && !slashMenu.classList.contains('hidden')) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      navigateMenu(slashMenu, e.key);
      return;
    }
  }

  const isSubmit = useCtrlEnter
    ? (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
    : (e.key === 'Enter' && !e.shiftKey);

  if (isSubmit) {
    e.preventDefault();
    sendMessage();
  }
});

btnSend.addEventListener('click', sendMessage);

btnNew.addEventListener('click', () => {
  vscode.postMessage({ type: 'newConversation' });
});

// Attach / slash-cmd toolbar buttons
$('#btn-attach')?.addEventListener('click', () => {
  const pos = inputEl.selectionStart;
  const text = inputEl.value;
  inputEl.value = text.slice(0, pos) + '@' + text.slice(pos);
  inputEl.selectionStart = inputEl.selectionEnd = pos + 1;
  inputEl.focus();
  handleInputChange();
});

$('#btn-slash-cmd')?.addEventListener('click', () => {
  inputEl.value = '/';
  inputEl.focus();
  handleInputChange();
});

// Terminal hint bar
$('#btn-dismiss-hint')?.addEventListener('click', () => {
  const hint = $('#terminal-hint');
  if (hint) hint.style.display = 'none';
});

$('#btn-hint-settings')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

// Sessions panel toggle
btnSessions.addEventListener('click', () => {
  const isOpen = !sessionsPanel.classList.contains('hidden');
  if (isOpen) {
    sessionsPanel.classList.add('hidden');
  } else {
    sessionsPanel.classList.remove('hidden');
    sessionsSearch.focus();
    vscode.postMessage({ type: 'getSessionList' });
  }
});

// Close sessions panel on outside click
document.addEventListener('click', (e) => {
  if (!sessionsPanel.contains(e.target) && !btnSessions.contains(e.target)) {
    sessionsPanel.classList.add('hidden');
  }
  if (!$('#mode-picker').contains(e.target)) {
    modeMenu.classList.add('hidden');
  }
});

// Sessions search
sessionsSearch.addEventListener('input', () => {
  vscode.postMessage({ type: 'getSessionList' });
});

// Mode picker
btnMode.addEventListener('click', (e) => {
  e.stopPropagation();
  modeMenu.classList.toggle('hidden');
});

document.querySelectorAll('.mode-option').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = el.dataset.mode;
    setMode(mode);
    modeMenu.classList.add('hidden');
  });
});

// Permission dialog buttons
btnApprove.addEventListener('click', () => {
  const requestId = permDialog.dataset.requestId;
  permDialog.classList.add('hidden');
  vscode.postMessage({ type: 'permissionResponse', requestId, approved: true });
});

btnReject.addEventListener('click', () => {
  const requestId = permDialog.dataset.requestId;
  permDialog.classList.add('hidden');
  vscode.postMessage({ type: 'permissionResponse', requestId, approved: false });
});

// Plan dialog
document.querySelectorAll('.plan-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!pendingPlanRequest) return;
    const action = btn.dataset.action;
    const feedback = planFeedback.value.trim();
    planDialog.classList.add('hidden');
    vscode.postMessage({
      type: 'planAccepted',
      action,
      originalRequest: pendingPlanRequest.originalRequest,
      feedback: feedback || undefined,
    });
    pendingPlanRequest = null;
  });
});

$('#plan-dialog-esc').addEventListener('click', () => {
  planDialog.classList.add('hidden');
  pendingPlanRequest = null;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !planDialog.classList.contains('hidden')) {
    planDialog.classList.add('hidden');
    pendingPlanRequest = null;
  }
  if (!planDialog.classList.contains('hidden') && pendingPlanRequest) {
    if (e.key === '1') document.querySelector('.plan-option[data-action="autoAccept"]')?.click();
    if (e.key === '2') document.querySelector('.plan-option[data-action="manualApprove"]')?.click();
    if (e.key === '3') document.querySelector('.plan-option[data-action="keepPlanning"]')?.click();
  }
  if (e.key === 'Escape' && !editApprovalDialog.classList.contains('hidden')) {
    dismissEditApproval();
  }
  if (!editApprovalDialog.classList.contains('hidden') && pendingEditRequest) {
    if (e.key === '1') document.querySelector('.edit-approval-option[data-action="yes"]')?.click();
    if (e.key === '2') document.querySelector('.edit-approval-option[data-action="yesAll"]')?.click();
    if (e.key === '3') document.querySelector('.edit-approval-option[data-action="no"]')?.click();
  }
});

// Edit approval dialog
function showEditApprovalDialog(requestId, filePath, description) {
  pendingEditRequest = { requestId };
  editApprovalPath.textContent = filePath || '';
  editApprovalDesc.textContent = description || '';
  editApprovalDesc.style.display = description ? '' : 'none';
  editApprovalFeedback.value = '';
  editApprovalDialog.classList.remove('hidden');
}

function dismissEditApproval() {
  editApprovalDialog.classList.add('hidden');
  pendingEditRequest = null;
}

document.querySelectorAll('.edit-approval-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!pendingEditRequest) return;
    const { requestId } = pendingEditRequest;
    const action = btn.dataset.action;
    const feedback = editApprovalFeedback.value.trim();
    dismissEditApproval();
    if (action === 'yes') {
      vscode.postMessage({ type: 'editApprovalResponse', requestId, approved: true });
    } else if (action === 'yesAll') {
      // Switch to acceptEdits mode and approve this edit
      setMode('acceptEdits');
      vscode.postMessage({ type: 'modeChange', mode: 'acceptEdits' });
      vscode.postMessage({ type: 'editApprovalResponse', requestId, approved: true });
    } else {
      // No — reject with optional feedback
      vscode.postMessage({ type: 'editApprovalResponse', requestId, approved: false, feedback: feedback || undefined });
    }
  });
});

$('#edit-approval-esc').addEventListener('click', () => {
  if (pendingEditRequest) {
    vscode.postMessage({ type: 'editApprovalResponse', requestId: pendingEditRequest.requestId, approved: false });
  }
  dismissEditApproval();
});

// ─── Core functions ──────────────────────────────────────────

function sendMessage() {
  if (isStreaming) return;
  const text = inputEl.value.trim();
  if (!text) return;

  // Handle slash commands locally
  if (text.startsWith('/')) {
    const handled = handleSlashCommand(text);
    if (handled) {
      inputEl.value = '';
      autoResizeTextarea();
      return;
    }
  }

  // Append user message
  appendUserMessage(text);
  inputEl.value = '';
  autoResizeTextarea();
  closeAllMenus();
  hideWelcome();

  setStreaming(true);

  vscode.postMessage({ type: 'sendMessage', text, mode: currentMode });
}

function handleSlashCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const name = parts[0].toLowerCase();

  switch (name) {
    case '/clear':
      clearConversation();
      vscode.postMessage({ type: 'newConversation' });
      return true;
    case '/help':
      appendSystemMessage(buildHelpText());
      return true;
    case '/model':
      appendSystemMessage('Current model is configured in Settings (`claudeCodeReplica.model`).');
      return true;
    case '/context':
      appendSystemMessage(
        `Context usage: ~${totalInputTokens.toLocaleString()} input tokens, ~${totalOutputTokens.toLocaleString()} output tokens this session.`
      );
      return true;
    case '/resume':
    case '/sessions':
      sessionsPanel.classList.remove('hidden');
      return true;
    case '/compact':
      appendSystemMessage('Compact mode is not yet implemented. Use /clear to start fresh.');
      return true;
    default:
      return false;
  }
}

function buildHelpText() {
  const cmds = SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(12)} ${c.desc}`).join('\n');
  return `**Ryan's Claude Code — Available Commands**\n\`\`\`\n${cmds}\n\`\`\`\n\n**Keyboard shortcuts:**\n- \`Alt+K\` — Insert @-mention of active file\n- \`Ctrl+Escape\` — Focus/blur Claude\n- \`Ctrl+Shift+Escape\` — Open in new tab`;
}

// ─── Message rendering ────────────────────────────────────────

function appendUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'message message-user';
  el.innerHTML = `<div class="user-card">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function startAssistantMessage() {
  const el = document.createElement('div');
  el.className = 'message message-assistant';
  el.innerHTML = `
    <div class="timeline">
      <div class="tl-entry tl-thought">
        <div class="tl-left"><div class="tl-dot tl-dot-muted"></div><div class="tl-line"></div></div>
        <div class="tl-right">
          <button class="thought-header">
            <span class="thought-label">Thinking...</span>
            <span class="thought-chevron">›</span>
          </button>
        </div>
      </div>
      <div class="tl-entry tl-text">
        <div class="tl-left"><div class="tl-dot"></div><div class="tl-line"></div></div>
        <div class="tl-right">
          <div class="md-content" data-raw=""></div>
        </div>
      </div>
    </div>
  `;
  messagesEl.appendChild(el);
  streamingEl = el;

  currentThinkingWord = pickThinkingWord();
  appendCursorAndWord();

  // Rotate word every 2 seconds throughout streaming
  wordRotationInterval = setInterval(() => {
    currentThinkingWord = pickThinkingWord();
    if (streamingEl) {
      const wordEl = streamingEl.querySelector('.thinking-word');
      if (wordEl) wordEl.textContent = currentThinkingWord + '…';
    }
  }, 2000);

  scrollToBottom();
}

function appendCursorAndWord() {
  if (!streamingEl) return;
  const mdEl = streamingEl.querySelector('.md-content');
  if (!mdEl) return;
  // Remove any existing cursor/word before re-adding
  mdEl.querySelector('.cursor-block')?.remove();
  mdEl.querySelector('.thinking-word')?.remove();
  const cursor = document.createElement('span');
  cursor.className = 'cursor-block';
  const word = document.createElement('span');
  word.className = 'thinking-word';
  word.textContent = currentThinkingWord + '…';
  mdEl.appendChild(cursor);
  mdEl.appendChild(word);
}

function appendToken(text) {
  if (!streamingEl) startAssistantMessage();

  // Stamp time-to-first-token on first token
  if (!firstTokenReceived && assistantStartTime) {
    firstTokenReceived = true;
    const elapsed = Math.floor((Date.now() - assistantStartTime) / 1000);
    const labelEl = streamingEl.querySelector('.thought-label');
    if (labelEl) labelEl.textContent = `Thought for ${elapsed}s`;
  }

  const mdEl = streamingEl.querySelector('.md-content');
  if (mdEl) {
    mdEl.dataset.raw = (mdEl.dataset.raw || '') + text;
    mdEl.innerHTML = renderMarkdown(mdEl.dataset.raw);
    appendCursorAndWord();
  }
  scrollToBottom(false);
}

function finalizeAssistantMessage(inputTokens, outputTokens) {
  isStreaming = false;
  setStreaming(false);

  assistantStartTime = null;
  firstTokenReceived = false;
  clearInterval(wordRotationInterval);
  wordRotationInterval = null;

  if (streamingEl) {
    const mdEl = streamingEl.querySelector('.md-content');
    if (mdEl) {
      // Final render — no cursor or word
      mdEl.innerHTML = renderMarkdown(mdEl.dataset.raw || '');
      if (!mdEl.dataset.raw) {
        mdEl.closest('.tl-entry')?.remove();
      }
    }
    streamingEl = null;
  }

  totalInputTokens += (inputTokens || 0);
  totalOutputTokens += (outputTokens || 0);
  updateCtxIndicator(inputTokens, outputTokens);
  scrollToBottom();
}

function appendToolCall(toolName, toolId, input) {
  if (!streamingEl) startAssistantMessage();

  const displayName = toolDisplayName(toolName);
  const inputText = formatToolInput(toolName, input);

  const entry = document.createElement('div');
  entry.className = 'tl-entry tl-tool';
  entry.dataset.toolId = toolId;
  entry.innerHTML = `
    <div class="tl-left"><div class="tl-dot"></div><div class="tl-line"></div></div>
    <div class="tl-right">
      <div class="tl-tool-name">${escapeHtml(displayName)}</div>
      <div class="tool-card">
        <div class="tool-row tool-row-in">
          <span class="row-label">IN</span>
          <code class="row-content">${escapeHtml(inputText)}</code>
        </div>
      </div>
    </div>
  `;

  const timeline = streamingEl.querySelector('.timeline');
  const textEntry = streamingEl.querySelector('.tl-text');
  timeline.insertBefore(entry, textEntry);
  scrollToBottom();
}

function finalizeToolCall(toolId, output, isError, diff) {
  const entry = document.querySelector(`.tl-tool[data-tool-id="${toolId}"]`);
  if (!entry) return;

  const card = entry.querySelector('.tool-card');
  if (card) {
    const truncated = output && output.length > 2000
      ? output.slice(0, 2000) + '\n...(truncated)'
      : (output || '(no output)');
    const outRow = document.createElement('div');
    outRow.className = `tool-row tool-row-out${isError ? ' tool-row-error' : ''}`;
    outRow.innerHTML = `
      <span class="row-label">OUT</span>
      <pre class="row-content">${escapeHtml(truncated)}</pre>
    `;
    card.appendChild(outRow);
  }

  if (diff) appendDiffBlock(diff);
}

function appendDiffBlock(diff) {
  if (!streamingEl) return;
  const msgContent = streamingEl.querySelector('.tl-text .tl-right');
  if (!msgContent) return;

  const diffHtml = buildDiffHtml(diff.oldContent, diff.newContent);
  const el = document.createElement('div');
  el.className = 'diff-block';
  el.dataset.path = diff.path;
  el.dataset.oldContent = diff.oldContent;
  el.dataset.newContent = diff.newContent;
  el.innerHTML = `
    <div class="diff-header">
      <span class="diff-file-path">${escapeHtml(diff.path)}</span>
      <div class="diff-actions">
        <button class="btn-accept" onclick="acceptDiff(this)">✓ Accept</button>
        <button class="btn-reject" onclick="rejectDiff(this)">✕ Reject</button>
      </div>
    </div>
    ${diff.description ? `<div class="diff-description">${escapeHtml(diff.description)}</div>` : ''}
    <div class="diff-content">${diffHtml}</div>
  `;
  msgContent.insertBefore(el, msgContent.querySelector('.md-content'));
  scrollToBottom();
}

function buildDiffHtml(oldContent, newContent) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');
  const lines = [];

  // Simple line-by-line diff (no LCS for brevity — show both sides with context)
  const maxLen = Math.max(oldLines.length, newLines.length);
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const o = oldLines[i];
    const n = newLines[j];
    if (o === n) {
      lines.push(`<div class="diff-line diff-line-context">${escapeHtml(o || '')}</div>`);
      i++; j++;
    } else {
      if (i < oldLines.length) {
        lines.push(`<div class="diff-line diff-line-remove">${escapeHtml(o || '')}</div>`);
        i++;
      }
      if (j < newLines.length) {
        lines.push(`<div class="diff-line diff-line-add">${escapeHtml(n || '')}</div>`);
        j++;
      }
    }
    if (lines.length > 300) {
      lines.push('<div class="diff-line diff-line-context">...(diff truncated)...</div>');
      break;
    }
  }
  return lines.join('');
}

function appendSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message message-assistant';
  el.innerHTML = `
    <div class="timeline">
      <div class="tl-entry tl-text">
        <div class="tl-left"><div class="tl-dot"></div><div class="tl-line"></div></div>
        <div class="tl-right"><div class="md-content">${renderMarkdown(text)}</div></div>
      </div>
    </div>
  `;
  messagesEl.appendChild(el);
  hideWelcome();
  scrollToBottom();
}

function showError(message) {
  setStreaming(false);
  streamingEl = null;

  const el = document.createElement('div');
  el.className = 'message-error';
  el.innerHTML = `<strong>Error:</strong> ${escapeHtml(message)}`;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function clearConversation() {
  messagesEl.innerHTML = '';
  streamingEl = null;
  currentSessionId = null;
  totalInputTokens = 0;
  totalOutputTokens = 0;
  sessionTitle.textContent = 'Untitled';
  ctxIndicator.classList.add('hidden');
  showWelcome();
}

function loadSession(session) {
  clearConversation();
  sessionsPanel.classList.add('hidden');
  currentSessionId = session.id;
  sessionTitle.textContent = session.title;

  for (const msg of session.messages) {
    if (msg.role === 'user') {
      appendUserMessage(msg.content);
    } else {
      appendLoadedAssistantMessage(msg.content);
    }
  }
  hideWelcome();
  scrollToBottom();
}

function appendLoadedAssistantMessage(content) {
  const el = document.createElement('div');
  el.className = 'message message-assistant';
  el.innerHTML = `
    <div class="timeline">
      <div class="tl-entry tl-text">
        <div class="tl-left"><div class="tl-dot"></div><div class="tl-line"></div></div>
        <div class="tl-right"><div class="md-content">${renderMarkdown(content)}</div></div>
      </div>
    </div>
  `;
  messagesEl.appendChild(el);
}

// ─── Session list rendering ───────────────────────────────────

function renderSessionList(groups, query) {
  sessionsList.innerHTML = '';
  const search = sessionsSearch.value.toLowerCase().trim();

  let totalShown = 0;

  for (const group of groups) {
    const filteredSessions = search
      ? group.sessions.filter((s) => s.title.toLowerCase().includes(search))
      : group.sessions;

    if (!filteredSessions.length) continue;

    const labelEl = document.createElement('div');
    labelEl.className = 'sessions-group-label';
    labelEl.textContent = group.label;
    sessionsList.appendChild(labelEl);

    for (const session of filteredSessions) {
      const item = document.createElement('div');
      item.className = 'session-item';
      const time = formatRelativeTime(session.updatedAt);
      item.innerHTML = `
        <span class="session-title">${escapeHtml(session.title)}</span>
        <span class="session-time">${time}</span>
        <div class="session-actions">
          <button title="Rename" onclick="renameSession('${session.id}', event)">✎</button>
          <button title="Delete" onclick="deleteSession('${session.id}', event)">✕</button>
        </div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        sessionTitle.textContent = session.title;
        vscode.postMessage({ type: 'loadSession', id: session.id });
      });
      sessionsList.appendChild(item);
      totalShown++;
    }
  }

  if (totalShown === 0) {
    const empty = document.createElement('div');
    empty.className = 'sessions-empty';
    empty.textContent = search ? 'No matching conversations.' : 'No past conversations yet.';
    sessionsList.appendChild(empty);
  }
}

window.renameSession = (id, e) => {
  e.stopPropagation();
  const newTitle = prompt('Rename conversation:');
  if (newTitle && newTitle.trim()) {
    vscode.postMessage({ type: 'renameSession', id, title: newTitle.trim() });
    vscode.postMessage({ type: 'getSessionList' });
  }
};

window.deleteSession = (id, e) => {
  e.stopPropagation();
  vscode.postMessage({ type: 'deleteSession', id });
};


window.acceptDiff = (btn) => {
  const block = btn.closest('.diff-block');
  const requestId = block.dataset.requestId;
  if (requestId) {
    // Pending approval — tell backend to apply
    vscode.postMessage({ type: 'editApprovalResponse', requestId, approved: true });
    block.querySelector('.btn-accept').textContent = '✓ Accepted';
  } else {
    // Already applied — just open the file
    vscode.postMessage({ type: 'openFile', path: block.dataset.path });
    block.querySelector('.btn-accept').textContent = '✓ Applied';
  }
  block.querySelector('.btn-accept').disabled = true;
  block.querySelector('.btn-reject').disabled = true;
};

window.rejectDiff = (btn) => {
  const block = btn.closest('.diff-block');
  const requestId = block.dataset.requestId;
  if (requestId) {
    // Pending approval — tell backend to skip
    vscode.postMessage({ type: 'editApprovalResponse', requestId, approved: false });
    block.querySelector('.btn-reject').textContent = '✕ Rejected';
  } else {
    // Already applied — revert
    vscode.postMessage({ type: 'rejectEdit', path: block.dataset.path, oldContent: block.dataset.oldContent });
    block.querySelector('.btn-reject').textContent = '✕ Reverted';
  }
  block.querySelector('.btn-accept').disabled = true;
  block.querySelector('.btn-reject').disabled = true;
};

function showPendingDiff(requestId, diff) {
  if (!streamingEl) return;
  const msgContent = streamingEl.querySelector('.tl-text .tl-right');
  if (!msgContent) return;

  const diffHtml = buildDiffHtml(diff.oldContent, diff.newContent);
  const el = document.createElement('div');
  el.className = 'diff-block';
  el.dataset.requestId = requestId;
  el.dataset.path = diff.path;
  el.dataset.oldContent = diff.oldContent;
  el.dataset.newContent = diff.newContent;
  el.innerHTML = `
    <div class="diff-header">
      <span class="diff-file-path">${escapeHtml(diff.path)}</span>
      <div class="diff-actions">
        <button class="btn-accept" onclick="acceptDiff(this)">✓ Accept</button>
        <button class="btn-reject" onclick="rejectDiff(this)">✕ Reject</button>
      </div>
    </div>
    ${diff.description ? `<div class="diff-description">${escapeHtml(diff.description)}</div>` : ''}
    <div class="diff-content">${diffHtml}</div>
  `;
  msgContent.insertBefore(el, msgContent.querySelector('.md-content'));
  scrollToBottom();
}

// ─── @-mention autocomplete ───────────────────────────────────

function handleInputChange() {
  const text = inputEl.value;
  const cursor = inputEl.selectionStart;

  // Look for @query before cursor
  const before = text.slice(0, cursor);
  const atMatch = before.match(/@([\w./\-]*)$/);

  if (atMatch) {
    const query = atMatch[1];
    slashMenu.classList.add('hidden');
    vscode.postMessage({ type: 'findFiles', query });
    return;
  }

  // Look for /command at start
  const slashMatch = text.match(/^\/([\w]*)$/);
  if (slashMatch) {
    const query = slashMatch[1].toLowerCase();
    mentionMenu.classList.add('hidden');
    renderSlashMenu(query);
    return;
  }

  closeAllMenus();
}

function renderMentionMenu(files) {
  if (!files || files.length === 0) {
    mentionMenu.classList.add('hidden');
    return;
  }

  mentionMenu.innerHTML = '';
  files.slice(0, 10).forEach((file) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    const parts = file.split('/');
    const name = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/');
    item.innerHTML = `
      <span class="menu-item-icon">📄</span>
      <span class="menu-item-text">${escapeHtml(name)}</span>
      ${dir ? `<span class="menu-item-desc">${escapeHtml(dir)}</span>` : ''}
    `;
    item.addEventListener('click', () => insertMentionCompletion(file));
    mentionMenu.appendChild(item);
  });

  if (files.length === 0) {
    mentionMenu.innerHTML = '<div class="menu-empty">No matching files</div>';
  }

  mentionMenu.classList.remove('hidden');
}

function renderSlashMenu(query) {
  const matches = SLASH_COMMANDS.filter((c) =>
    c.name.slice(1).startsWith(query)
  );

  if (!matches.length) {
    slashMenu.classList.add('hidden');
    return;
  }

  slashMenu.innerHTML = '';
  matches.forEach((cmd) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.innerHTML = `
      <span class="menu-item-icon">${cmd.icon}</span>
      <span class="menu-item-text">${escapeHtml(cmd.name)}</span>
      <span class="menu-item-desc">${escapeHtml(cmd.desc)}</span>
    `;
    item.addEventListener('click', () => {
      inputEl.value = cmd.name + ' ';
      autoResizeTextarea();
      slashMenu.classList.add('hidden');
      inputEl.focus();
    });
    slashMenu.appendChild(item);
  });

  slashMenu.classList.remove('hidden');
}

function insertMentionCompletion(file) {
  const text = inputEl.value;
  const cursor = inputEl.selectionStart;
  const before = text.slice(0, cursor);
  const atMatch = before.match(/@([\w./\-]*)$/);

  if (atMatch) {
    const start = cursor - atMatch[0].length;
    const after = text.slice(cursor);
    inputEl.value = text.slice(0, start) + '@' + file + ' ' + after;
    inputEl.selectionStart = inputEl.selectionEnd = start + file.length + 2;
  }

  mentionMenu.classList.add('hidden');
  inputEl.focus();
}

function navigateMenu(menu, key) {
  const items = [...menu.querySelectorAll('.menu-item')];
  if (!items.length) return;

  const current = menu.querySelector('.menu-item.selected');
  let idx = items.indexOf(current);

  if (key === 'ArrowDown') idx = (idx + 1) % items.length;
  else if (key === 'ArrowUp') idx = (idx - 1 + items.length) % items.length;
  else if (key === 'Enter' || key === 'Tab') {
    if (current) current.click();
    return;
  }

  items.forEach((el) => el.classList.remove('selected'));
  items[idx]?.classList.add('selected');
  items[idx]?.scrollIntoView({ block: 'nearest' });
}

function insertTextAtCursor(text) {
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  const current = inputEl.value;
  inputEl.value = current.slice(0, start) + text + current.slice(end);
  inputEl.selectionStart = inputEl.selectionEnd = start + text.length;
  inputEl.focus();
  autoResizeTextarea();
}

// ─── Permission dialog ────────────────────────────────────────

function showPermissionDialog(requestId, message) {
  permDialog.dataset.requestId = requestId;
  permMessage.textContent = message;
  permDialog.classList.remove('hidden');
}

// ─── Mode management ──────────────────────────────────────────

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-option').forEach((el) => {
    el.classList.toggle('active', el.dataset.mode === mode);
  });

  document.body.classList.remove('mode-default', 'mode-acceptEdits', 'mode-plan');
  document.body.classList.add(`mode-${mode}`);

  const labels = { default: 'Ask before edits', acceptEdits: 'Edit automatically', plan: 'Plan mode' };
  modeLabel.textContent = labels[mode] || mode;
}

// ─── Context indicator ────────────────────────────────────────

function updateCtxIndicator(inputTokens, outputTokens) {
  if (!inputTokens) return;
  const pct = Math.round((inputTokens / 200000) * 100);
  ctxIndicator.textContent = `ctx: ${pct}%`;
  ctxIndicator.classList.remove('hidden');
}

function updateEditorContextIndicator() {
  if (!editorContext || !editorContext.file) {
    statusText.textContent = '';
    return;
  }
  const parts = editorContext.file.split('/');
  const name = parts[parts.length - 1];
  const selInfo = editorContext.hasSelection ? ` #L${editorContext.selectionLines}` : '';
  statusText.innerHTML = `<span class="status-file">📄 ${escapeHtml(name)}${selInfo}</span>`;
}

// ─── Welcome screen ───────────────────────────────────────────

/** Show the login screen (no API key) */
function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  header.classList.add('hidden');
  chatArea.classList.add('hidden');
  inputFooter.classList.add('hidden');
}

/** Show the main chat screen (API key is set) */
function showChatScreen() {
  loginScreen.classList.add('hidden');
  header.classList.remove('hidden');
  chatArea.classList.remove('hidden');
  inputFooter.classList.remove('hidden');
  showWelcome();
}

function showWelcome() {
  welcomeScreen.classList.remove('hidden');
}

function hideWelcome() {
  welcomeScreen.classList.add('hidden');
}

window.openSettings = () => {
  vscode.postMessage({ type: 'openSettings' });
};

// ─── Utility ─────────────────────────────────────────────────

function setStreaming(val) {
  isStreaming = val;
  btnSend.disabled = val;
  if (val) {
    statusText.innerHTML = '<span class="status-thinking">● thinking...</span>';
  } else {
    updateEditorContextIndicator();
  }
}

function autoResizeTextarea() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
}

function scrollToBottom(force = true) {
  const el = chatArea;
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  if (force || isNearBottom) {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }
}

function closeAllMenus() {
  mentionMenu.classList.add('hidden');
  slashMenu.classList.add('hidden');
}

function updateSendHint() {
  btnSend.title = useCtrlEnter ? 'Send (Ctrl+Enter)' : 'Send (Enter)';
  inputEl.placeholder = useCtrlEnter
    ? 'Ask Claude anything... (Ctrl+Enter to send)'
    : 'Ask Claude anything... (@ for files, / for commands)';
}

function getLogoSrc() {
  // The logo URI is injected by the extension into the webview HTML
  const img = document.querySelector('#logo-source');
  return img ? img.src : '';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toolDisplayName(toolName) {
  const names = {
    run_terminal: 'Bash',
    read_file: 'Read',
    edit_file: 'Edit',
    list_files: 'List Files',
    search_workspace: 'Search',
  };
  return names[toolName] || toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatToolInput(toolName, input) {
  switch (toolName) {
    case 'run_terminal': return input.command ? String(input.command) : '';
    case 'read_file':
    case 'edit_file':    return input.path ? String(input.path) : '';
    case 'list_files':   return input.path ? String(input.path) : '.';
    case 'search_workspace': return input.query ? String(input.query) : '';
    default: return JSON.stringify(input, null, 2);
  }
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

// ─── Markdown renderer ────────────────────────────────────────
// A lightweight but capable in-browser markdown renderer.

function renderMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Fenced code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const langLabel = lang || 'text';
    return `<div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">${escapeHtml(langLabel)}</span>
        <button class="code-block-copy" onclick="copyCode(this)" data-code="${escapeHtml(code.trimEnd())}">Copy</button>
      </div>
      <pre><code>${escapedCode}</code></pre>
    </div>`;
  });

  // Inline code (before other replacements)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/(^[-*+] .+(\n[-*+] .+)*)/gm, (match) => {
    const items = match.split('\n').map((l) => `<li>${l.replace(/^[-*+] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/(^\d+\. .+(\n\d+\. .+)*)/gm, (match) => {
    const items = match.split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables (basic)
  html = html.replace(/(^\|.+\|(\n\|[-:| ]+\|)?(\n\|.+\|)*)/gm, (match) => {
    const rows = match.trim().split('\n').filter((r) => !r.match(/^\|[-: |]+\|$/));
    if (rows.length < 1) return match;
    const headerRow = rows[0];
    const bodyRows = rows.slice(1);
    const headerCells = headerRow.split('|').filter((c) => c.trim()).map((c) => `<th>${c.trim()}</th>`).join('');
    const bodyHtml = bodyRows.map((r) => {
      const cells = r.split('|').filter((c) => c.trim()).map((c) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });

  // Paragraphs (double newlines → paragraph breaks)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Single newlines → <br> within paragraphs
  html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');

  // Clean up empty paragraphs and fix nesting
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-3]>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<table>)/g, '$1');
  html = html.replace(/(<\/table>)<\/p>/g, '$1');
  html = html.replace(/<p>(<div class="code-block">)/g, '$1');
  html = html.replace(/(<\/div>)<\/p>/g, '$1');
  html = html.replace(/<p><hr><\/p>/g, '<hr>');

  return html;
}

window.copyCode = (btn) => {
  const code = btn.dataset.code || '';
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    // Fallback
    const el = document.createElement('textarea');
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
};

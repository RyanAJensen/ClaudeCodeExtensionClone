import * as vscode from 'vscode';

/**
 * Generates the HTML content for the Ryan's Claude Code webview.
 * Injects proper CSP, nonce, and VS Code webview URIs for local assets.
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const nonce = getNonce();

  const stylesUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css')
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js')
  );
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'claude-logo.svg')
  );
  const mascotUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'resources', 'claude-mascot.png')
  );

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Ryan's Claude Code</title>
</head>
<body>

  <!-- ═══════════════════════════════════════════════════
       LOGIN SCREEN — shown when no API key is set
  ═══════════════════════════════════════════════════ -->
  <div id="login-screen" class="hidden">

    <!-- Pixel art illustration -->
    <div id="login-art">
      <svg id="login-art-svg" viewBox="0 0 460 205" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <!-- Dither patterns for left buildings (dark gray #787878) -->
          <pattern id="d50g" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#787878"/>
            <rect x="3" y="3" width="3" height="3" fill="#787878"/>
          </pattern>
          <pattern id="d25g" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#787878"/>
          </pattern>
          <pattern id="d12g" x="0" y="0" width="9" height="9" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#787878"/>
          </pattern>
          <!-- Dither patterns for right buildings (light gray #aaaaaa) -->
          <pattern id="d50l" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#aaaaaa"/>
            <rect x="3" y="3" width="3" height="3" fill="#aaaaaa"/>
          </pattern>
          <pattern id="d25l" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#aaaaaa"/>
          </pattern>
          <!-- Dither patterns for bright C logo (#cccccc) -->
          <pattern id="d50w" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#cccccc"/>
            <rect x="3" y="3" width="3" height="3" fill="#cccccc"/>
          </pattern>
          <pattern id="d25w" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="3" height="3" fill="#cccccc"/>
          </pattern>
        </defs>

        <!-- Background -->
        <rect width="460" height="205" fill="#272727"/>

        <!-- Stars -->
        <text x="84"  y="49"  fill="#fff" font-family="monospace" font-size="15" opacity="0.65">*</text>
        <text x="186" y="31"  fill="#fff" font-family="monospace" font-size="14" opacity="0.70">*</text>
        <text x="246" y="66"  fill="#fff" font-family="monospace" font-size="14" opacity="0.65">*</text>
        <text x="308" y="40"  fill="#fff" font-family="monospace" font-size="12" opacity="0.50">*</text>
        <text x="368" y="105" fill="#fff" font-family="monospace" font-size="11" opacity="0.40">*</text>
        <text x="41"  y="143" fill="#fff" font-family="monospace" font-size="11" opacity="0.50">*</text>
        <text x="424" y="42"  fill="#fff" font-family="monospace" font-size="10" opacity="0.35">*</text>

        <!-- Left building cluster -->
        <!-- Building A: wide flat base -->
        <rect x="46"  y="100" width="192" height="105" fill="#6e6e6e"/>
        <rect x="46"  y="91"  width="154" height="9"   fill="url(#d50g)"/>
        <rect x="46"  y="82"  width="116" height="9"   fill="url(#d25g)"/>
        <rect x="46"  y="73"  width="78"  height="9"   fill="url(#d12g)"/>
        <!-- Building B: taller, offset right -->
        <rect x="92"  y="60"  width="102" height="145" fill="#7a7a7a"/>
        <rect x="92"  y="51"  width="82"  height="9"   fill="url(#d50g)"/>
        <rect x="92"  y="42"  width="62"  height="9"   fill="url(#d25g)"/>
        <rect x="92"  y="33"  width="42"  height="9"   fill="url(#d12g)"/>

        <!-- Right building cluster -->
        <!-- Building C: large light block -->
        <rect x="284" y="85"  width="105" height="120" fill="#9a9a9a"/>
        <rect x="284" y="76"  width="84"  height="9"   fill="url(#d50l)"/>
        <rect x="284" y="67"  width="63"  height="9"   fill="url(#d25l)"/>
        <!-- Building D: medium overlapping -->
        <rect x="328" y="126" width="80"  height="79"  fill="#8a8a8a"/>
        <rect x="328" y="117" width="64"  height="9"   fill="url(#d50l)"/>
        <rect x="328" y="108" width="48"  height="9"   fill="url(#d25l)"/>

        <!-- Pixel art "C" logo (upper right) -->
        <!-- Top bar -->
        <rect x="356" y="14"  width="63"  height="12"  fill="#d0d0d0"/>
        <rect x="419" y="14"  width="9"   height="12"  fill="url(#d50w)"/>
        <rect x="428" y="14"  width="6"   height="12"  fill="url(#d25w)"/>
        <!-- Left bar -->
        <rect x="356" y="14"  width="12"  height="78"  fill="#d0d0d0"/>
        <rect x="356" y="92"  width="12"  height="9"   fill="url(#d50w)"/>
        <!-- Bottom bar -->
        <rect x="356" y="80"  width="63"  height="12"  fill="#d0d0d0"/>
        <rect x="419" y="80"  width="9"   height="12"  fill="url(#d50w)"/>
        <rect x="428" y="80"  width="6"   height="12"  fill="url(#d25w)"/>
        <!-- Eye inside C -->
        <rect x="380" y="43"  width="12"  height="12"  fill="#272727"/>
        <rect x="383" y="46"  width="5"   height="5"   fill="#d0d0d0" opacity="0.25"/>

        <!-- Clawd mascot PNG -->
        <image href="${mascotUri}" x="40" y="105" width="100" height="100" preserveAspectRatio="xMidYMax meet"/>

        <!-- Bottom dashed divider line -->
        <line x1="0" y1="203" x2="460" y2="203" stroke="#4a4a4a" stroke-dasharray="6,5" stroke-width="2"/>
      </svg>
    </div>

    <!-- Login form -->
    <div id="login-form">
      <p id="login-desc">Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.</p>
      <p id="login-question">How do you want to log in?</p>

      <div class="login-options">
        <button class="login-btn login-btn-primary" id="btn-login-subscription">
          Claude.ai Subscription
        </button>
        <p class="login-btn-desc">Use your Claude Pro, Team, or Enterprise subscription</p>

        <button class="login-btn login-btn-secondary" id="btn-login-console">
          Anthropic Console
        </button>
        <p class="login-btn-desc">Pay for API usage through your Console account</p>

        <button class="login-btn login-btn-secondary" id="btn-login-providers">
          <span>Bedrock, Foundry, or Vertex</span>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 2.5H5.5M10.5 2.5V5.5M10.5 2.5L5.5 7.5M4.5 10.5H10.5V4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <p class="login-btn-desc">Instructions on how to use API keys or third-party providers.</p>
      </div>

      <p id="login-terminal-hint">Prefer the terminal experience? Run <code>claude</code> in terminal</p>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════
       CHAT SCREEN — shown when API key is configured
  ═══════════════════════════════════════════════════ -->

  <!-- Header -->
  <div id="header" class="hidden">
    <span id="session-title">Untitled</span>
    <div id="header-actions">
      <button id="btn-sessions" class="btn-icon-hdr" title="Past Conversations">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button id="btn-new" class="btn-icon-hdr" title="New Conversation">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </button>
      <button id="btn-logout" class="btn-icon-hdr" title="Log out / Change API key">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M10.5 5.5L13 8l-2.5 2.5M13 8H6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Sessions dropdown -->
  <div id="sessions-panel" class="hidden">
    <div id="sessions-search-wrap">
      <input id="sessions-search" type="text" placeholder="Search conversations..." autocomplete="off" />
    </div>
    <div id="sessions-list"></div>
  </div>

  <!-- Hidden logo source for avatar use -->
  <img id="logo-source" src="${logoUri}" class="hidden" alt="" />

  <!-- Chat area (scrollable, fills all remaining body height) -->
  <div id="chat-area" class="hidden">
    <!-- Welcome overlay — absolute, no flex competition -->
    <div id="welcome-screen" class="hidden">
      <div class="welcome-brand">
        <img class="welcome-brand-logo" src="${logoUri}" alt="" />
        <span class="welcome-brand-name">Ryan's Claude Code</span>
      </div>
      <div class="welcome-content">
        <img class="clawd-mascot" src="${mascotUri}" alt="Claude" />
        <p class="welcome-prompt">What to do first? Ask about this codebase or we can start writing code.</p>
      </div>
    </div>

    <div id="messages"></div>
    <div id="scroll-anchor"></div>
  </div>

  <!-- Input footer — plain flex-shrink: 0 body child, always at bottom -->
  <div id="input-footer" class="hidden">
    <div id="terminal-hint">
      <div class="hint-body">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="flex-shrink:0;opacity:0.7">
          <rect x="0.5" y="0.5" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.1"/>
          <path d="M2.5 4.5l2.5 2-2.5 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="7" y1="8.5" x2="10.5" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="hint-primary">Prefer the Terminal experience?</span>
        <button class="hint-link" id="btn-hint-settings">Switch back in Settings.</button>
      </div>
      <button id="btn-dismiss-hint" class="btn-dismiss-hint" title="Dismiss">×</button>
    </div>

    <div id="input-container">
      <div id="mention-menu" class="hidden"></div>
      <div id="slash-menu" class="hidden"></div>

      <div id="input-card">
        <textarea
          id="input"
          placeholder="Ctrl+Escape to focus or unfocus Claude"
          rows="1"
          autocomplete="off"
          spellcheck="true"
        ></textarea>

        <div id="input-toolbar">
          <div id="toolbar-left">
            <button id="btn-attach" class="btn-tool" title="Add context (+)">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 2.5v10M2.5 7.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            <button id="btn-slash-cmd" class="btn-tool" title="Commands (/)">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M10 2.5L5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div id="toolbar-right">
            <span id="ctx-indicator" class="ctx-indicator hidden"></span>
            <span id="status-text"></span>
            <div id="mode-picker">
            <button id="btn-mode" class="btn-mode-pill" title="Permission mode">
              <span id="mode-icon">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1.5C4.015 1.5 2 3.515 2 6a4.5 4.5 0 004.5 4.5A4.5 4.5 0 0011 6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M4.5 6.5l1.5 1.5 2.5-2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
              <span id="mode-label">Ask before edits</span>
            </button>
            <div id="mode-menu" class="hidden">
                <div class="mode-menu-header">
                  <span class="mode-menu-title">Modes</span>
                  <span class="mode-menu-shortcut">
                    <kbd>⇧</kbd><span class="mode-menu-plus">+</span><kbd>tab</kbd> to switch
                  </span>
                </div>
                <div class="mode-option" data-mode="default">
                  <span class="mode-icon-wrap">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M7 3.5C7 2.67 7.67 2 8.5 2S10 2.67 10 3.5V9c0 .83-.67 1.5-1.5 1.5S7 9.83 7 9V3.5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <path d="M5 6v3a4 4 0 008 0V6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <line x1="9" y1="13" x2="9" y2="16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <div class="mode-text">
                    <div class="mode-name">Ask before edits</div>
                    <div class="mode-desc">Claude will ask for approval before making each edit</div>
                  </div>
                  <span class="mode-check">✓</span>
                </div>
                <div class="mode-option" data-mode="acceptEdits">
                  <span class="mode-icon-wrap">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M4 9h10M4 5h6M4 13h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <path d="M12 11l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <div class="mode-text">
                    <div class="mode-name">Edit automatically</div>
                    <div class="mode-desc">Claude will edit your selected text or the whole file</div>
                  </div>
                  <span class="mode-check">✓</span>
                </div>
                <div class="mode-option" data-mode="plan">
                  <span class="mode-icon-wrap">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3" y="2" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                      <line x1="6" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <line x1="6" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <div class="mode-text">
                    <div class="mode-name">Plan mode</div>
                    <div class="mode-desc">Claude will explore the code and present a plan before editing</div>
                  </div>
                  <span class="mode-check">✓</span>
                </div>
              </div>
            </div>
            <button id="btn-send" title="Send (Enter)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 11.5V2.5M2.5 7l4.5-4.5L11.5 7" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Plan acceptance dialog -->
  <div id="plan-dialog" class="hidden">
    <div id="plan-dialog-inner">
      <div id="plan-dialog-title">Accept this plan?</div>
      <div id="plan-dialog-subtitle">Select text in the preview to add comments</div>
      <div id="plan-dialog-options">
        <button class="plan-option" data-action="autoAccept">
          <span class="plan-option-num">1</span>
          <span class="plan-option-label">Yes, and auto-accept</span>
        </button>
        <button class="plan-option" data-action="manualApprove">
          <span class="plan-option-num">2</span>
          <span class="plan-option-label">Yes, and manually approve edits</span>
        </button>
        <button class="plan-option" data-action="keepPlanning">
          <span class="plan-option-num">3</span>
          <span class="plan-option-label">No, keep planning</span>
        </button>
      </div>
      <textarea id="plan-feedback" placeholder="Tell Claude what to do instead" rows="2"></textarea>
      <div id="plan-dialog-esc">Esc to cancel</div>
    </div>
  </div>

  <!-- Edit approval dialog -->
  <div id="edit-approval-dialog" class="hidden">
    <div id="edit-approval-inner">
      <div id="edit-approval-title">Allow write to <span id="edit-approval-path"></span>?</div>
      <div id="edit-approval-desc"></div>
      <div id="edit-approval-options">
        <button class="edit-approval-option" data-action="yes">
          <span class="edit-approval-num">1</span>
          <span class="edit-approval-label">Yes</span>
        </button>
        <button class="edit-approval-option" data-action="yesAll">
          <span class="edit-approval-num">2</span>
          <span class="edit-approval-label">Yes, allow all edits this session</span>
        </button>
        <button class="edit-approval-option" data-action="no">
          <span class="edit-approval-num">3</span>
          <span class="edit-approval-label">No</span>
        </button>
      </div>
      <textarea id="edit-approval-feedback" placeholder="Tell Claude what to do instead" rows="2"></textarea>
      <div id="edit-approval-esc">Esc to cancel</div>
    </div>
  </div>

  <!-- Permission dialog -->
  <div id="permission-dialog" class="hidden">
    <div id="permission-dialog-inner">
      <div id="permission-dialog-header">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style="color:var(--brand);flex-shrink:0">
          <path d="M7.5 1L14 13H1L7.5 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M7.5 5.5V8.5M7.5 10.5V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <strong>Permission Required</strong>
      </div>
      <div id="permission-dialog-message"></div>
      <div id="permission-dialog-actions">
        <button id="btn-approve" class="btn-primary">Approve</button>
        <button id="btn-reject" class="btn-secondary">Reject</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

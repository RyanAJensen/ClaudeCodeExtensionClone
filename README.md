# Ryan's Claude Code — VS Code Extension

A replica of the Claude Code VS Code extension, built with the Anthropic SDK. Provides a streaming AI chat interface inside VS Code with tool calls, file editing, session history, and tight editor integration.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [VS Code](https://code.visualstudio.com/) v1.94 or later
- An [Anthropic API key](https://console.anthropic.com)

---

## Running in Development

1. **Clone the repo and install dependencies**

   ```bash
   git clone https://github.com/RyanAJensen/ClaudeCodeExtensionClone.git
   cd ClaudeCodeExtensionClone
   npm install
   ```

2. **Build the extension**

   ```bash
   npm run build
   ```

3. **Open in VS Code**

   ```bash
   code .
   ```

4. **Launch the Extension Development Host**

   Press `F5` (or go to **Run → Start Debugging**). A new VS Code window opens with the extension loaded.

5. **Set your API key**

   In the Extension Development Host window, open Settings (`Ctrl+,`) and search for `claudeCodeReplica.apiKey`. Paste your Anthropic API key.

   Alternatively, click the Claude icon in the activity bar — you'll see the login screen with an **Anthropic Console** button that opens Settings directly.

6. **Open the chat**

   Click the Claude spark icon in the activity bar (left sidebar) to open the chat panel, or press `Ctrl+Escape` to focus/unfocus it.

---

## Watch Mode (auto-rebuild on changes)

```bash
npm run watch
```

Then press `F5` to launch the host. The extension will rebuild automatically when you save files — reload the host window (`Ctrl+Shift+P` → **Developer: Reload Window**) to pick up changes.

---

## Packaging as a `.vsix`

```bash
npm run package
```

This produces a `claude-code-replica-1.0.0.vsix` file. Install it in any VS Code instance via:

```
Extensions panel → ··· menu → Install from VSIX
```

---

## Features

| Feature | Description |
|---|---|
| Streaming chat | Token-by-token streaming responses with animated thinking cursor |
| File tools | Read, edit, list, and search workspace files |
| Native diff review | Proposed edits open as a VS Code diff — accept, allow all, or reject |
| Terminal commands | Run shell commands from chat (with approval prompt) |
| Session history | Conversations saved locally, browsable by date |
| Permission modes | **Default** (ask per edit) · **Accept Edits** (auto-apply) · **Plan** (generate a plan doc, no changes) |
| @-mentions | Type `@` to autocomplete and attach file contents as context |
| Editor context | Active file and selected code are automatically included as context |
| Mode theming | Input border, submit button, and cursor color change per mode |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Escape` | Focus / unfocus the chat input |
| `Ctrl+Shift+Escape` | Open Claude in a new editor tab |
| `Alt+K` | Insert an @-mention of the current file |

---

## Configuration

All settings are under `claudeCodeReplica.*` in VS Code Settings.

| Setting | Default | Description |
|---|---|---|
| `apiKey` | — | Your Anthropic API key |
| `model` | `claude-sonnet-4-6` | Model to use (`opus`, `sonnet`, or `haiku`) |
| `initialPermissionMode` | `default` | Starting mode for new conversations |
| `useCtrlEnterToSend` | `false` | Use `Ctrl+Enter` to send instead of `Enter` |
| `preferredLocation` | `sidebar` | Open in sidebar or new tab by default |
| `enableNewConversationShortcut` | `false` | Enable `Ctrl+N` for new conversation |

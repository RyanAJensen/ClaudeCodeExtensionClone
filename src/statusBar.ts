import * as vscode from 'vscode';

/**
 * Manages the "✱ Ryan's Claude Code" status bar item.
 */
export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.text = `✱ Ryan's Claude Code`;
    this.item.tooltip = `Open Ryan's Claude Code`;
    this.item.command = 'claude-code-replica.sidebar.open';
    this.item.show();
    context.subscriptions.push(this.item);
  }

  /** Update status bar text to show activity */
  setThinking(): void {
    this.item.text = `$(loading~spin) Ryan's Claude Code`;
    this.item.tooltip = 'Claude is thinking...';
  }

  /** Reset to default state */
  setIdle(): void {
    this.item.text = `✱ Ryan's Claude Code`;
    this.item.tooltip = `Open Ryan's Claude Code`;
  }

  /** Show a permission-pending indicator */
  setPendingPermission(): void {
    this.item.text = `$(circle-filled) Ryan's Claude Code`;
    this.item.tooltip = 'Claude is waiting for your approval';
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }
}

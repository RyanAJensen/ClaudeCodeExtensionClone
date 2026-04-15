import * as vscode from 'vscode';
import * as path from 'path';

export interface EditorContext {
  filePath: string | null;
  relativePath: string | null;
  language: string | null;
  content: string | null;
  selection: SelectionContext | null;
  workspaceRoot: string | null;
  workspaceName: string | null;
}

export interface SelectionContext {
  text: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Extracts context from the active editor (file, language, selection, workspace).
 */
export class FileContext {
  /**
   * Returns the current editor context for injection into Claude's system prompt.
   */
  static getCurrent(): EditorContext {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    let filePath: string | null = null;
    let relativePath: string | null = null;
    let language: string | null = null;
    let content: string | null = null;
    let selection: SelectionContext | null = null;

    if (editor) {
      filePath = editor.document.uri.fsPath;
      language = editor.document.languageId;
      content = editor.document.getText();

      if (workspaceFolder) {
        relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
      }

      const sel = editor.selection;
      if (!sel.isEmpty) {
        selection = {
          text: editor.document.getText(sel),
          startLine: sel.start.line + 1,
          endLine: sel.end.line + 1,
          startColumn: sel.start.character + 1,
          endColumn: sel.end.character + 1,
        };
      }
    }

    return {
      filePath,
      relativePath,
      language,
      content,
      selection,
      workspaceRoot: workspaceFolder?.uri.fsPath ?? null,
      workspaceName: workspaceFolder?.name ?? null,
    };
  }

  /**
   * Reads the content of a file by its absolute path.
   * Returns null if the file can't be read.
   */
  static async readFile(filePath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Writes content to a file.
   */
  static async writeFile(filePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    // Auto-open the file so the user sees the change
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Lists files in a directory, returning relative paths.
   */
  static async listFiles(dirPath: string): Promise<string[]> {
    try {
      const uri = vscode.Uri.file(dirPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries.map(([name, type]) => {
        const isDir = type === vscode.FileType.Directory;
        return isDir ? `${name}/` : name;
      });
    } catch {
      return [];
    }
  }

  /**
   * Applies edits to the currently open document (or opens the file first).
   * Returns true on success.
   */
  static async applyEdit(filePath: string, newContent: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);

      // Ensure parent directory exists
      const parentUri = vscode.Uri.file(require('path').dirname(filePath));
      try {
        await vscode.workspace.fs.createDirectory(parentUri);
      } catch {
        // Directory already exists — ignore
      }

      // Write directly to disk — handles both new and existing files reliably
      await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent, 'utf-8'));

      // Sync in-memory document if the file is already open in an editor
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === uri.fsPath
      );
      if (openDoc && openDoc.isDirty === false) {
        // Document is open and clean — apply an in-memory edit to avoid VS Code
        // showing an "external change" prompt
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          uri,
          new vscode.Range(new vscode.Position(0, 0), openDoc.positionAt(openDoc.getText().length)),
          newContent
        );
        await vscode.workspace.applyEdit(edit);
        await openDoc.save();
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Builds a system prompt string that includes current workspace/editor context.
   */
  static buildSystemPrompt(ctx: EditorContext, permissionMode: 'default' | 'acceptEdits' | 'plan' = 'default'): string {
    const modeInstructions: Record<string, string[]> = {
      default: [
        '',
        'Permission mode: ASK BEFORE EDITS',
        '- You MUST request permission before making any file edit or running any terminal command.',
        '- Use your tools normally but the user will be prompted to approve each action.',
      ],
      acceptEdits: [
        '',
        'Permission mode: AUTO-ACCEPT EDITS',
        '- Apply file edits and run commands automatically without asking for confirmation.',
        '- Work efficiently and complete tasks in full.',
      ],
      plan: [
        '',
        'Permission mode: PLAN MODE',
        '- Do NOT make any file edits or run terminal commands.',
        '- You may use read_file, list_files, and search_workspace to gather information.',
        '- Respond with a detailed markdown plan describing exactly what you would change and why.',
        '- Format the plan with numbered steps, file paths, and code snippets where helpful.',
        '- End your response with a brief summary of the plan.',
      ],
    };

    const lines: string[] = [
      `You are Ryan's Claude Code, an expert AI coding assistant integrated into VS Code.`,
      'You help developers write, edit, debug, and understand code.',
      '',
      'You have access to the following tools:',
      '- read_file: Read the contents of any file in the workspace',
      '- edit_file: Propose and apply edits to a file',
      '- list_files: List files in a directory',
      '- search_workspace: Search for text across workspace files',
      '- run_terminal: Execute a shell command and return its output',
      '',
      'Guidelines:',
      '- Be concise and direct. Avoid unnecessary preamble.',
      '- When making file edits, always show the diff and explain what changed.',
      '- Prefer targeted edits over full rewrites unless a full rewrite is clearly better.',
      '- If you need context about a file, read it first before proposing changes.',
      '- Always respect the user\'s existing code style.',
      ...(modeInstructions[permissionMode] ?? []),
    ];

    if (ctx.workspaceName) {
      lines.push('', `Workspace: ${ctx.workspaceName}`);
      if (ctx.workspaceRoot) {
        lines.push(`Root: ${ctx.workspaceRoot}`);
      }
    }

    if (ctx.relativePath) {
      lines.push('', `Active file: ${ctx.relativePath} (${ctx.language})`);
    }

    if (ctx.selection) {
      lines.push(
        '',
        `The user has selected lines ${ctx.selection.startLine}-${ctx.selection.endLine}:`,
        '```',
        ctx.selection.text,
        '```'
      );
    }

    return lines.join('\n');
  }
}

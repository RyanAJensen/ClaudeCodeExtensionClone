import * as vscode from 'vscode';
import * as path from 'path';

export interface MentionResult {
  mention: string;       // e.g. "@src/foo.ts#L5-10"
  filePath: string;      // absolute path
  relativePath: string;  // relative to workspace
  startLine?: number;    // 1-based
  endLine?: number;      // 1-based
  content?: string;      // resolved file content (or excerpt)
}

/**
 * Parses @-mentions from user input and resolves them to file content.
 */
export class MentionParser {
  // Matches @path/to/file.ext or @path/to/file.ext#L5-10 or @path/to/file.ext#5-10
  private static MENTION_RE = /@([\w./\-]+(?:#(?:L?\d+)(?:-L?\d+)?)?)/g;

  /**
   * Extract all @-mentions from a message string.
   */
  static extractMentions(text: string): string[] {
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    MentionParser.MENTION_RE.lastIndex = 0;
    while ((m = MentionParser.MENTION_RE.exec(text)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  }

  /**
   * Resolve mentions to file contents given a workspace root.
   */
  static async resolveMentions(
    mentions: string[],
    workspaceRoot: string
  ): Promise<MentionResult[]> {
    const results: MentionResult[] = [];

    for (const mention of mentions) {
      const hashIdx = mention.indexOf('#');
      const filePart = hashIdx >= 0 ? mention.slice(0, hashIdx) : mention;
      const linePart = hashIdx >= 0 ? mention.slice(hashIdx + 1) : null;

      const absPath = path.join(workspaceRoot, filePart);

      let startLine: number | undefined;
      let endLine: number | undefined;
      if (linePart) {
        const lineMatch = linePart.replace(/L/g, '').split('-');
        startLine = parseInt(lineMatch[0], 10) || undefined;
        endLine = lineMatch[1] ? parseInt(lineMatch[1], 10) : startLine;
      }

      try {
        const uri = vscode.Uri.file(absPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        let content = Buffer.from(bytes).toString('utf-8');

        if (startLine !== undefined && endLine !== undefined) {
          const lines = content.split('\n');
          content = lines.slice(startLine - 1, endLine).join('\n');
        }

        results.push({
          mention: `@${mention}`,
          filePath: absPath,
          relativePath: filePart,
          startLine,
          endLine,
          content,
        });
      } catch {
        // File not found — skip silently
      }
    }

    return results;
  }

  /**
   * Find workspace files that fuzzy-match the given query.
   * Used for the @ autocomplete dropdown.
   */
  static async findMatchingFiles(query: string): Promise<string[]> {
    if (!query) return [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return [];

    const pattern = `**/*${query}*`;
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 20);

    const root = workspaceFolders[0].uri.fsPath;
    return uris.map((u) => path.relative(root, u.fsPath)).sort();
  }

  /**
   * Build a context block string from resolved mentions, ready to prepend to a message.
   */
  static buildContextBlock(resolved: MentionResult[]): string {
    if (!resolved.length) return '';

    const parts = resolved.map((r) => {
      const lineInfo =
        r.startLine !== undefined
          ? ` (lines ${r.startLine}-${r.endLine})`
          : '';
      return `<file path="${r.relativePath}"${lineInfo}>\n${r.content}\n</file>`;
    });

    return parts.join('\n\n');
  }
}

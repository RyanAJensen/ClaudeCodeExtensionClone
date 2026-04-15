import type Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { FileContext } from '../context/FileContext';

/** Tool definitions sent to the Claude API */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the workspace. Use relative paths from the workspace root.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file from the workspace root (e.g. "src/index.ts")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Propose and apply an edit to a file. Provide the COMPLETE new content for the file. The change will be shown to the user as a diff.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file from the workspace root',
        },
        content: {
          type: 'string',
          description: 'The complete new content for the file',
        },
        description: {
          type: 'string',
          description: 'Brief description of what changed and why',
        },
      },
      required: ['path', 'content', 'description'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories at a given path in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to list. Use "." for the workspace root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_workspace',
    description:
      'Search for a text pattern across all files in the workspace. Returns matching file paths and line excerpts.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text or regex pattern to search for',
        },
        filePattern: {
          type: 'string',
          description: 'Optional glob pattern to filter files (e.g. "**/*.ts")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'run_terminal',
    description:
      'Execute a shell command in the workspace directory. Use for running tests, installing packages, building code, etc. Always confirm with the user before running destructive commands.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to run',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (relative to workspace root). Defaults to workspace root.',
        },
      },
      required: ['command'],
    },
  },
];

export interface ToolExecutionResult {
  output: string;
  isError: boolean;
  /** For edit_file: the proposed diff to show in UI */
  diff?: { path: string; oldContent: string; newContent: string; description: string };
}

/**
 * Executes a tool call returned by Claude and returns the result.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  permissionMode: 'default' | 'acceptEdits' | 'plan',
  onPermissionRequest: (msg: string) => Promise<boolean>
): Promise<ToolExecutionResult> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  try {
    switch (toolName) {
      case 'read_file': {
        const filePath = path.join(workspaceRoot, input.path as string);
        const content = await FileContext.readFile(filePath);
        if (content === null) {
          return { output: `Error: File not found: ${input.path}`, isError: true };
        }
        // Truncate very large files
        const truncated = content.length > 50000
          ? content.slice(0, 50000) + '\n\n[... file truncated at 50,000 characters ...]'
          : content;
        return { output: truncated, isError: false };
      }

      case 'edit_file': {
        const filePath = path.join(workspaceRoot, input.path as string);
        const newContent = input.content as string;
        const description = (input.description as string) ?? 'Edit proposed by Claude';

        // Read old content for diff
        const oldContent = (await FileContext.readFile(filePath)) ?? '';

        if (permissionMode === 'plan') {
          return {
            output: `[Plan mode] Would edit ${input.path}: ${description}`,
            isError: false,
            diff: { path: input.path as string, oldContent, newContent, description },
          };
        }

        if (permissionMode === 'default') {
          // Show diff inline and wait for user to accept or reject before applying
          const diffPayload = JSON.stringify({ path: input.path, oldContent, newContent, description });
          const approved = await onPermissionRequest(`__EDIT_DIFF__${diffPayload}`);
          if (!approved) {
            return { output: 'Edit rejected by user.', isError: false };
          }
          const success = await FileContext.applyEdit(filePath, newContent);
          if (!success) {
            return { output: `Error: Failed to write ${input.path}. Check that the path is valid and the file is not read-only.`, isError: true };
          }
          // Diff already shown inline — don't re-send it in toolCallEnd
          return { output: `Successfully edited ${input.path}`, isError: false };
        }

        const success = await FileContext.applyEdit(filePath, newContent);
        if (!success) {
          return { output: `Error: Failed to write ${input.path}. Check that the path is valid and the file is not read-only.`, isError: true };
        }
        return {
          output: `Successfully edited ${input.path}`,
          isError: false,
          diff: { path: input.path as string, oldContent, newContent, description },
        };
      }

      case 'list_files': {
        const dirPath = path.join(workspaceRoot, input.path as string);
        const entries = await FileContext.listFiles(dirPath);
        if (!entries.length) {
          return { output: `(empty directory or not found)`, isError: false };
        }
        return { output: entries.join('\n'), isError: false };
      }

      case 'search_workspace': {
        const query = input.query as string;
        const filePattern = (input.filePattern as string) ?? '**/*';
        const uris = await vscode.workspace.findFiles(filePattern, '**/node_modules/**', 100);
        const results: string[] = [];

        for (const uri of uris) {
          try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(bytes).toString('utf-8');
            const lines = content.split('\n');
            const relativePath = path.relative(workspaceRoot, uri.fsPath);

            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push(`${relativePath}:${idx + 1}: ${line.trim()}`);
              }
            });

            if (results.length > 200) break; // cap results
          } catch {
            // skip unreadable files
          }
        }

        if (!results.length) {
          return { output: `No matches found for "${query}"`, isError: false };
        }
        return { output: results.slice(0, 200).join('\n'), isError: false };
      }

      case 'run_terminal': {
        const command = input.command as string;
        const cwd = input.cwd
          ? path.join(workspaceRoot, input.cwd as string)
          : workspaceRoot;

        if (permissionMode === 'plan') {
          return { output: `[Plan mode] Would run: ${command}`, isError: false };
        }

        if (permissionMode === 'default') {
          const approved = await onPermissionRequest(
            `Claude wants to run a terminal command:\n\`${command}\`\n\nApprove?`
          );
          if (!approved) {
            return { output: `Command rejected by user.`, isError: true };
          }
        }

        const output = await runCommand(command, cwd);
        return output;
      }

      default:
        return { output: `Unknown tool: ${toolName}`, isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Tool error: ${msg}`, isError: true };
  }
}

function runCommand(command: string, cwd: string): Promise<ToolExecutionResult> {
  return new Promise((resolve) => {
    const proc = cp.exec(command, { cwd, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (err && !stdout) {
        resolve({ output: output || err.message, isError: true });
      } else {
        resolve({ output: output || '(no output)', isError: false });
      }
    });
    void proc;
  });
}

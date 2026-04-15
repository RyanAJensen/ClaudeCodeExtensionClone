import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ToolCallRecord } from '../sessions/SessionManager';
import { TOOLS, executeTool } from './tools';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan';

export interface StreamCallbacks {
  onToken(text: string): void;
  onToolCallStart(toolName: string, toolId: string, input: Record<string, unknown>): void;
  onToolCallEnd(toolId: string, output: string, isError: boolean, diff?: DiffResult): void;
  onError(error: string): void;
  onDone(inputTokens: number, outputTokens: number): void;
  onPermissionRequest(message: string): Promise<boolean>;
}

export interface DiffResult {
  path: string;
  oldContent: string;
  newContent: string;
  description: string;
}

/**
 * Wraps the Anthropic SDK with streaming support and tool execution.
 */
export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Send a conversation to Claude with streaming. Handles multi-turn tool use automatically.
   */
  async streamChat(
    messages: ChatMessage[],
    systemPrompt: string,
    permissionMode: PermissionMode,
    callbacks: StreamCallbacks
  ): Promise<void> {
    // Convert our internal message format to Anthropic API format
    const apiMessages = this.convertMessages(messages);

    await this.runTurn(apiMessages, systemPrompt, permissionMode, callbacks, 0);
  }

  private async runTurn(
    apiMessages: Anthropic.MessageParam[],
    systemPrompt: string,
    permissionMode: PermissionMode,
    callbacks: StreamCallbacks,
    depth: number
  ): Promise<void> {
    // Prevent infinite tool loops
    if (depth > 10) {
      callbacks.onError('Maximum tool call depth reached.');
      return;
    }

    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: apiMessages,
        tools: TOOLS,
      });

      let inputTokens = 0;
      let outputTokens = 0;
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let currentToolId = '';
      let currentToolName = '';
      let currentToolInputStr = '';

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolInputStr = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            callbacks.onToken(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            currentToolInputStr += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId && currentToolName) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(currentToolInputStr || '{}');
            } catch {
              // use empty object on parse error
            }
            toolUseBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
            });
            callbacks.onToolCallStart(currentToolName, currentToolId, parsedInput);
            currentToolId = '';
            currentToolName = '';
            currentToolInputStr = '';
          }
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
        }
      }

      const finalMessage = await stream.finalMessage();

      if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        // Execute all tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        const toolRecords: ToolCallRecord[] = [];

        for (const block of toolUseBlocks) {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            permissionMode,
            callbacks.onPermissionRequest
          );

          callbacks.onToolCallEnd(block.id, result.output, result.isError, result.diff);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.output,
            is_error: result.isError,
          });

          toolRecords.push({
            id: block.id,
            type: block.name as ToolCallRecord['type'],
            input: block.input as Record<string, unknown>,
            output: result.output,
            error: result.isError ? result.output : undefined,
          });
        }

        // Continue the conversation with tool results
        const assistantContent: Anthropic.ContentBlock[] = finalMessage.content;
        apiMessages.push({ role: 'assistant', content: assistantContent });
        apiMessages.push({ role: 'user', content: toolResults });

        await this.runTurn(apiMessages, systemPrompt, permissionMode, callbacks, depth + 1);
      } else {
        callbacks.onDone(inputTokens, outputTokens);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      callbacks.onError(msg);
    }
  }

  /**
   * Generate a short conversation title using Claude.
   * Returns a 3-6 word title or falls back to the truncated prompt on failure.
   */
  async generateTitle(userMessage: string, assistantMessage: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 30,
        messages: [
          {
            role: 'user',
            content: `Generate a short title (4-7 words) for this conversation. If the user is making a request or asking Claude to perform a task, use a formal noun phrase (e.g. "Refactor Auth Middleware for Compliance"). If the user is asking a question or having a discussion, use a natural descriptive title. Reply with ONLY the title — no punctuation, no quotes, no explanation.\n\nUser message: ${userMessage.slice(0, 500)}`,
          },
        ],
      });
      const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      return raw || this.fallbackTitle(userMessage);
    } catch {
      return this.fallbackTitle(userMessage);
    }
  }

  private fallbackTitle(msg: string): string {
    const cleaned = msg.replace(/<file[^>]*>[\s\S]*?<\/file>/g, '').trim();
    const first = cleaned.split('\n')[0].trim();
    return first.length <= 60 ? first : first.slice(0, 57) + '...';
  }

  private convertMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }
}

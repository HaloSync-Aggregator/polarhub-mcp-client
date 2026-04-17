/**
 * AgentLoopRunner
 *
 * Gemini + MCP tool loop: calls Gemini, detects function calls,
 * executes MCP tools, feeds results back via SessionMemory, and repeats
 * until Gemini returns a plain text response or a stop condition is hit.
 */

import type { MCPTool, MCPToolResult, MCPClientManager } from '../mcp/client.js';
import type { GeminiProvider } from '../llm/gemini.js';
import { generateMessageId } from '../shared/index.js';
import type { SessionMemory } from './sessionMemory.js';

export class AgentCancelled extends Error {
  constructor() {
    super('Agent loop cancelled');
    this.name = 'AgentCancelled';
  }
}

interface AgentLoopDeps {
  gemini: GeminiProvider;
  mcp: MCPClientManager;
  /** Real-time WS event emitter — tool_call_start / tool_call_end only */
  send: (msg: object) => void;
}

interface AgentLoopOptions {
  maxIterations?: number; // default 5
  toolTimeoutMs?: number; // default 90_000 (flight_search/order_reshop can take 30~60s)
}

export class AgentLoopRunner {
  private cancelled = false;
  private readonly maxIterations: number;
  private readonly toolTimeoutMs: number;

  constructor(private deps: AgentLoopDeps, opts: AgentLoopOptions = {}) {
    this.maxIterations = opts.maxIterations ?? 5;
    this.toolTimeoutMs = opts.toolTimeoutMs ?? 90_000;
  }

  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Run the agent loop. Mutates `memory` in-place — caller keeps the reference.
   */
  async run(
    userMessage: string,
    memory: SessionMemory,
    tools: MCPTool[],
    locale?: string
  ): Promise<{ finalText: string }> {
    memory.appendUserMessage(userMessage);

    for (let i = 0; i < this.maxIterations; i++) {
      if (this.cancelled) throw new AgentCancelled();

      console.log(`[AgentLoop] step ${i + 1}/${this.maxIterations} (history=${memory.getLength()})`);

      const contents = memory.getContents();
      const hint = memory.getKeyFactsHint();

      let resp: Awaited<ReturnType<typeof this.deps.gemini.chatStep>>;
      try {
        resp = await this.deps.gemini.chatStep(contents, tools, locale, hint);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Gemini error at step ${i + 1}: ${msg}`);
      }

      // Gemini requested a tool call
      if (resp.functionCall) {
        const { name, args } = resp.functionCall;

        if (this.cancelled) throw new AgentCancelled();

        const callId = generateMessageId();
        console.log(`[AgentLoop] calling tool: ${name}`, args);
        this.deps.send({ type: 'tool_call_start', id: callId, toolName: name, timestamp: Date.now() });

        // Preserve the raw model Content (thoughtSignature, etc.) when available
        if (resp.modelContent) {
          memory.appendModelContent(resp.modelContent);
        } else {
          memory.appendFunctionCall(name, args);
        }

        const toolResult = await this.callToolWithTimeout(name, args);

        if (this.cancelled) throw new AgentCancelled();

        const resultText = toolResult.content[0]?.text ?? '';
        memory.appendFunctionResponse(name, resultText, !!toolResult.isError);

        this.deps.send({
          type: 'tool_call_end',
          id: callId,
          toolName: name,
          success: !toolResult.isError,
          timestamp: Date.now(),
        });
        continue;
      }

      // Plain text response — loop complete
      const finalText = resp.text ?? '';
      if (resp.modelContent) {
        memory.appendModelContent(resp.modelContent);
      } else {
        memory.appendModelText(finalText);
      }
      console.log('[AgentLoop] done');
      return { finalText };
    }

    throw new Error('Agent loop exceeded maximum iterations');
  }

  private async callToolWithTimeout(
    name: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const startedAt = Date.now();
    const timeout = new Promise<MCPToolResult>((resolve) =>
      setTimeout(
        () => {
          console.warn(`[AgentLoop] tool '${name}' exceeded ${this.toolTimeoutMs}ms — abandoning`);
          resolve({
            content: [{ type: 'text', text: `Tool '${name}' timed out after ${this.toolTimeoutMs}ms` }],
            isError: true,
          });
        },
        this.toolTimeoutMs
      )
    );
    try {
      // Pass the same timeout to the MCP SDK so the underlying request is also aborted
      const toolCall = this.deps.mcp.callTool(name, args, { timeoutMs: this.toolTimeoutMs });
      const result = await Promise.race([toolCall, timeout]);
      const elapsed = Date.now() - startedAt;
      console.log(`[AgentLoop] tool '${name}' returned in ${elapsed}ms (isError=${!!result.isError})`);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[AgentLoop] tool '${name}' threw after ${elapsed}ms:`, msg);
      return { content: [{ type: 'text', text: `Tool error: ${msg}` }], isError: true };
    }
  }
}

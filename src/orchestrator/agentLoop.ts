/**
 * AgentLoopRunner — provider-agnostic Gemini/Bedrock/etc. + MCP tool loop.
 *
 * All provider-specific details (message format, thoughtSignature, toolUseId pairing)
 * live in the AgentLoopAdapter implementation, not here.
 */

import type { MCPTool, MCPToolResult, MCPClientManager } from '../mcp/client.js';
import { generateMessageId } from '../shared/index.js';
import type { AgentLoopAdapter, ProviderMemory } from '../llm/agentLoopAdapter.js';

export class AgentCancelled extends Error {
  constructor() {
    super('Agent loop cancelled');
    this.name = 'AgentCancelled';
  }
}

interface AgentLoopDeps {
  adapter: AgentLoopAdapter;
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
    memory: ProviderMemory,
    tools: MCPTool[],
    locale?: string,
  ): Promise<{ finalText: string }> {
    this.deps.adapter.appendUserMessage(memory, userMessage);

    for (let i = 0; i < this.maxIterations; i++) {
      if (this.cancelled) throw new AgentCancelled();

      console.log(`[AgentLoop] step ${i + 1}/${this.maxIterations} (history=${memory.getLength()})`);

      let resp;
      try {
        resp = await this.deps.adapter.chatStep(memory, tools, locale);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`LLM error at step ${i + 1}: ${msg}`);
      }

      // Tool requested — append assistant turn, execute tool, append tool result, continue
      if (resp.functionCall) {
        const { name, args } = resp.functionCall;

        if (this.cancelled) throw new AgentCancelled();

        const callId = generateMessageId();
        console.log(`[AgentLoop] calling tool: ${name}`, args);
        this.deps.send({ type: 'tool_call_start', id: callId, toolName: name, timestamp: Date.now() });
        this.deps.adapter.appendAssistantToolCall(memory, resp.functionCall, resp.raw);

        const toolResult = await this.callToolWithTimeout(name, args);

        if (this.cancelled) {
          // Roll back the dangling assistant(toolUse) so the memory stays valid
          // for the next run on this session (Bedrock invariant).
          this.deps.adapter.rollbackLastToolCall?.(memory);
          throw new AgentCancelled();
        }

        const resultText = toolResult.content[0]?.text ?? '';
        this.deps.adapter.appendToolResult(memory, name, resultText, !!toolResult.isError);

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
      this.deps.adapter.appendAssistantText(memory, finalText, resp.raw);
      console.log('[AgentLoop] done');
      return { finalText };
    }

    throw new Error('Agent loop exceeded maximum iterations');
  }

  private async callToolWithTimeout(
    name: string,
    args: Record<string, unknown>,
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
        this.toolTimeoutMs,
      ),
    );
    try {
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

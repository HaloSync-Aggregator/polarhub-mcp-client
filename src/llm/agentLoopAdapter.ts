/**
 * AgentLoopAdapter — provider-agnostic contract used by AgentLoopRunner.
 *
 * Each LLM provider (Gemini, Bedrock, ...) implements this interface so the
 * agent loop can drive multi-turn tool use without knowing the underlying
 * message format (Gemini Content[] vs Bedrock ConverseMessage[]).
 */

import type { MCPTool } from '../mcp/client.js';

/**
 * Opaque per-session memory owned by an adapter.
 * The loop does not read any fields other than `lastAccessedAt` for idle eviction.
 */
export interface ProviderMemory {
  readonly lastAccessedAt: number;
  getLength(): number;
}

export interface ChatStepResult {
  functionCall?: { name: string; args: Record<string, unknown> };
  text?: string;
  /** Provider-opaque raw payload — forwarded verbatim to appendAssistant* helpers. */
  raw?: unknown;
}

export interface AgentLoopAdapter {
  /** Create a new memory instance. Called when a fresh session starts. */
  createMemory(opts?: { maxLength?: number }): ProviderMemory;

  /** Append a user message (free-form text). */
  appendUserMessage(memory: ProviderMemory, text: string): void;

  /**
   * Run one LLM turn. Adapter builds system prompt + tool declarations from its memory
   * and injects any internal key-facts hint. Returns either a tool request or final text.
   */
  chatStep(memory: ProviderMemory, tools: MCPTool[], locale?: string): Promise<ChatStepResult>;

  /** Persist the assistant turn that triggered a tool call. `raw` is whatever the adapter returned as ChatStepResult.raw. */
  appendAssistantToolCall(
    memory: ProviderMemory,
    call: { name: string; args: Record<string, unknown> },
    raw?: unknown,
  ): void;

  /** Persist a plain-text assistant turn (loop terminator). */
  appendAssistantText(memory: ProviderMemory, text: string, raw?: unknown): void;

  /** Append a tool execution result. Adapter handles provider-specific pairing invariants (e.g. Bedrock toolUseId). */
  appendToolResult(
    memory: ProviderMemory,
    name: string,
    resultText: string,
    isError: boolean,
  ): void;

  /**
   * Optional — undo the most recent `appendAssistantToolCall` when the tool call
   * is cancelled before a result can be appended. Required by providers that
   * enforce strict tool pairing (Bedrock). Gemini can no-op.
   */
  rollbackLastToolCall?(memory: ProviderMemory): void;
}

/**
 * BedrockSessionMemory — short-term memory for AWS Bedrock Converse API agent loops.
 *
 * Key invariants enforced here (Bedrock rejects violations with 400):
 *  1. Strict user/assistant alternation.
 *  2. A `toolResult` block must sit inside a user message that IMMEDIATELY follows
 *     the assistant message containing the matching `toolUse` with the same `toolUseId`.
 *  3. Assistant messages must have at least one content block.
 *
 * Pruning is therefore load-bearing — it must not split tool pairs.
 */

import type { ProviderMemory } from '../llm/agentLoopAdapter.js';
import type { ConverseMessage, ConverseContentBlock } from '../llm/bedrock.js';
import {
  extractKeyFactsFromJsonResult,
  buildKeyFactsHint,
  type SessionKeyFacts,
} from './keyFacts.js';

interface BedrockMemoryOptions {
  maxLength?: number; // max ConverseMessage[] length, default 40
}

export class BedrockSessionMemory implements ProviderMemory {
  private messages: ConverseMessage[] = [];
  private keyFacts: SessionKeyFacts = {};
  private pendingToolUseId: string | null = null;
  public lastAccessedAt: number = Date.now();
  public readonly createdAt: number = Date.now();
  private readonly maxLength: number;

  constructor(opts: BedrockMemoryOptions = {}) {
    this.maxLength = opts.maxLength ?? 40;
  }

  // ===== accessors =====

  getMessages(): ConverseMessage[] {
    this.touch();
    return this.messages.map(m => ({ role: m.role, content: [...m.content] }));
  }

  getKeyFacts(): SessionKeyFacts {
    return { ...this.keyFacts };
  }

  getKeyFactsHint(): string | null {
    return buildKeyFactsHint(this.keyFacts);
  }

  getLength(): number {
    return this.messages.length;
  }

  // ===== appenders =====

  appendUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: [{ text }] });
    this.touch();
    this.pruneIfNeeded();
  }

  /**
   * Persist an assistant turn that triggered a tool call.
   * `raw` is the full content block array from the Converse response
   * (includes optional text preamble + the toolUse block).
   * Falls back to a minimal toolUse-only block if `raw` is absent.
   */
  appendAssistantToolCall(
    call: { name: string; args: Record<string, unknown> },
    raw?: ConverseContentBlock[],
  ): void {
    const content: ConverseContentBlock[] = raw && raw.length > 0
      ? [...raw]
      : [{ toolUse: { toolUseId: this.generateToolUseId(), name: call.name, input: call.args } }];

    // Track the toolUseId so the next toolResult can pair correctly
    const toolUseBlock = content.find((b): b is { toolUse: { toolUseId: string; name: string; input: unknown } } =>
      typeof b === 'object' && b !== null && 'toolUse' in b,
    );
    if (toolUseBlock) {
      this.pendingToolUseId = toolUseBlock.toolUse.toolUseId;
    } else {
      // Shouldn't happen — but synthesize one to preserve the invariant
      const toolUseId = this.generateToolUseId();
      content.push({ toolUse: { toolUseId, name: call.name, input: call.args } });
      this.pendingToolUseId = toolUseId;
    }

    this.messages.push({ role: 'assistant', content });
    this.touch();
    // Do not prune between assistant(toolUse) and upcoming user(toolResult)
  }

  appendAssistantText(text: string, _raw?: ConverseContentBlock[]): void {
    // Bedrock rejects empty assistant messages — guarantee at least one block
    const safeText = text && text.length > 0 ? text : ' ';
    this.messages.push({ role: 'assistant', content: [{ text: safeText }] });
    this.pendingToolUseId = null;
    this.touch();
    this.pruneIfNeeded();
  }

  appendToolResult(name: string, resultText: string, isError: boolean): void {
    const toolUseId = this.pendingToolUseId;
    if (!toolUseId) {
      console.warn(`[BedrockSessionMemory] toolResult for '${name}' has no pending toolUseId — dropping`);
      return;
    }

    this.messages.push({
      role: 'user',
      content: [{
        toolResult: {
          toolUseId,
          content: [{ text: resultText || '' }],
          status: isError ? 'error' : 'success',
        },
      }],
    });
    this.pendingToolUseId = null;
    this.keyFacts = extractKeyFactsFromJsonResult(resultText, this.keyFacts, name);
    this.touch();
    this.pruneIfNeeded();
  }

  // ===== pruning =====

  private pruneIfNeeded(): void {
    if (this.messages.length <= this.maxLength) return;

    let trimmed = this.messages.slice(-this.maxLength);

    // Bedrock invariants:
    //  1. toolResult must be paired with an earlier assistant(toolUse). Drop orphan toolResults.
    //  2. The conversation must begin with role=user. Drop any leading assistant messages.
    // Apply in a single loop — stripping can cascade (toolResult removed → now leading assistant → remove that too).
    while (trimmed.length > 0 && (this.startsWithToolResult(trimmed[0]) || trimmed[0].role === 'assistant')) {
      trimmed = trimmed.slice(1);
    }

    this.messages = trimmed;
  }

  private startsWithToolResult(m: ConverseMessage): boolean {
    return m.role === 'user'
      && m.content.some(b => typeof b === 'object' && b !== null && 'toolResult' in b);
  }

  /**
   * Drop the last assistant(toolUse) message and clear pendingToolUseId.
   * Called when a tool call is cancelled after appendAssistantToolCall but before
   * appendToolResult — prevents leaving a dangling toolUse that would violate
   * Bedrock's strict alternation on the next turn.
   */
  rollbackLastToolCall(): void {
    if (this.messages.length === 0) return;
    const last = this.messages[this.messages.length - 1];
    const hasToolUse = last.role === 'assistant'
      && last.content.some(b => typeof b === 'object' && b !== null && 'toolUse' in b);
    if (hasToolUse) {
      this.messages.pop();
    }
    this.pendingToolUseId = null;
  }

  // ===== helpers =====

  private generateToolUseId(): string {
    return `tu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private touch(): void {
    this.lastAccessedAt = Date.now();
  }
}

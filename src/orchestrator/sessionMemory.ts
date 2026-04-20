/**
 * GeminiSessionMemory — short-term memory for Gemini-based agent loop sessions.
 *
 * Responsibilities:
 *  - Bounded Gemini Content[] history (safe pruning, preserving functionCall/Response pairs)
 *  - Key facts extraction delegated to orchestrator/keyFacts.ts
 *  - Access timestamp tracking for idle-session eviction
 */

import type { Content } from '@google/generative-ai';
import type { ProviderMemory } from '../llm/agentLoopAdapter.js';
import {
  extractKeyFactsFromJsonResult,
  buildKeyFactsHint,
  type SessionKeyFacts,
} from './keyFacts.js';

interface SessionMemoryOptions {
  maxLength?: number; // max Content[] length, default 40
}

export class GeminiSessionMemory implements ProviderMemory {
  private contents: Content[] = [];
  private keyFacts: SessionKeyFacts = {};
  public lastAccessedAt: number = Date.now();
  public readonly createdAt: number = Date.now();
  private readonly maxLength: number;

  constructor(opts: SessionMemoryOptions = {}) {
    this.maxLength = opts.maxLength ?? 40;
  }

  // ===== Content[] accessors =====

  getContents(): Content[] {
    this.touch();
    // Shallow-copy the parts array per entry to protect against SDK in-place mutation
    // (some Gemini thinking-model responses mutate Content to attach thoughtSignature).
    return this.contents.map(c => ({ ...c, parts: [...(c.parts ?? [])] }));
  }

  appendUserMessage(text: string): void {
    this.contents.push({ role: 'user', parts: [{ text }] });
    this.touch();
    this.pruneIfNeeded();
  }

  appendModelText(text: string): void {
    this.contents.push({ role: 'model', parts: [{ text }] });
    this.touch();
    this.pruneIfNeeded();
  }

  /**
   * Append the raw model Content returned by Gemini.
   * Preserves all fields (thoughtSignature, etc.) required by thinking models
   * when echoing functionCall parts back on subsequent turns.
   */
  appendModelContent(content: Content): void {
    this.contents.push({ role: 'model', parts: [...(content.parts ?? [])] });
    this.touch();
    // Do not prune between functionCall and functionResponse pairs.
  }

  appendFunctionCall(name: string, args: Record<string, unknown>): void {
    this.contents.push({ role: 'model', parts: [{ functionCall: { name, args } }] });
    this.touch();
  }

  appendFunctionResponse(name: string, resultText: string, isError: boolean): void {
    this.contents.push({
      role: 'user',
      parts: [{
        functionResponse: {
          name,
          response: { result: resultText, isError },
        },
      }],
    });
    this.keyFacts = extractKeyFactsFromJsonResult(resultText, this.keyFacts, name);
    this.touch();
    this.pruneIfNeeded();
  }

  // ===== Key facts =====

  getKeyFacts(): SessionKeyFacts {
    return { ...this.keyFacts };
  }

  getKeyFactsHint(): string | null {
    return buildKeyFactsHint(this.keyFacts);
  }

  // ===== Pruning =====

  private pruneIfNeeded(): void {
    if (this.contents.length <= this.maxLength) return;

    let trimmed = this.contents.slice(-this.maxLength);

    // If the first kept entry is a functionResponse, its paired functionCall was dropped.
    // Drop orphan response(s) to keep Gemini pairing invariant.
    while (trimmed.length > 0 && this.isFunctionResponse(trimmed[0])) {
      trimmed = trimmed.slice(1);
    }

    this.contents = trimmed;
  }

  private isFunctionResponse(c: Content): boolean {
    return c.role === 'user'
      && Array.isArray(c.parts)
      && c.parts.some(p => typeof p === 'object' && p !== null && 'functionResponse' in p);
  }

  private touch(): void {
    this.lastAccessedAt = Date.now();
  }

  getLength(): number {
    return this.contents.length;
  }
}

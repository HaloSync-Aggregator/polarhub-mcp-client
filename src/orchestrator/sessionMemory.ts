/**
 * SessionMemory — short-term memory for agent loop sessions.
 *
 * Responsibilities:
 *  - Bounded Gemini Content[] history (safe pruning, preserving functionCall/Response pairs)
 *  - Key facts extraction (sessionId, orderId, transactionId, etc.) from tool results
 *  - Access timestamp tracking for idle-session eviction
 */

import type { Content } from '@google/generative-ai';

export interface SessionKeyFacts {
  mcpSessionId?: string;
  postBookingTransactionId?: string;
  postBookingOrderId?: string;
  lastToolCalled?: string;
  lastToolKeyIds?: Record<string, unknown>;
}

interface SessionMemoryOptions {
  maxLength?: number; // max Content[] length, default 40
}

export class SessionMemory {
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
    return [...this.contents];
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
    // Clone to avoid aliasing the SDK internal object
    this.contents.push({ role: 'model', parts: [...(content.parts ?? [])] });
    this.touch();
    // Do not prune between functionCall and functionResponse pairs; pruning happens on next user turn.
  }

  appendFunctionCall(name: string, args: Record<string, unknown>): void {
    this.contents.push({ role: 'model', parts: [{ functionCall: { name, args } }] });
    this.touch();
    // Do not prune here — keep paired with upcoming functionResponse
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
    this.extractKeyFactsFromResult(name, resultText);
    this.touch();
    this.pruneIfNeeded();
  }

  // ===== Key facts =====

  getKeyFacts(): SessionKeyFacts {
    return { ...this.keyFacts };
  }

  /**
   * Build a short context hint string for injection into Gemini systemInstruction.
   * Returns null when there are no facts to share.
   */
  getKeyFactsHint(): string | null {
    const f = this.keyFacts;
    const parts: string[] = [];
    if (f.mcpSessionId) parts.push(`Prime Booking sessionId: ${f.mcpSessionId}`);
    if (f.postBookingOrderId) parts.push(`Post-Booking orderId: ${f.postBookingOrderId}`);
    if (f.postBookingTransactionId) parts.push(`Post-Booking transactionId: ${f.postBookingTransactionId}`);
    if (f.lastToolCalled) parts.push(`Last tool called: ${f.lastToolCalled}`);
    if (f.lastToolKeyIds && Object.keys(f.lastToolKeyIds).length > 0) {
      const ids = Object.entries(f.lastToolKeyIds).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      parts.push(`Previous tool output IDs: ${ids}`);
    }
    return parts.length ? `[Session context]\n${parts.join('\n')}` : null;
  }

  private extractKeyFactsFromResult(toolName: string, resultText: string): void {
    this.keyFacts.lastToolCalled = toolName;
    if (!resultText) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      return; // non-JSON result — nothing to extract
    }

    const root = parsed as Record<string, unknown> | null;
    if (!root || typeof root !== 'object') return;

    const metadata = (root.metadata && typeof root.metadata === 'object')
      ? root.metadata as Record<string, unknown>
      : root;

    if (typeof metadata.sessionId === 'string') {
      this.keyFacts.mcpSessionId = metadata.sessionId;
    }
    if (typeof metadata.transactionId === 'string') {
      this.keyFacts.postBookingTransactionId = metadata.transactionId;
    }

    const data = metadata.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      if (typeof data.orderId === 'string') {
        this.keyFacts.postBookingOrderId = data.orderId;
      }

      const keyIds: Record<string, unknown> = {};
      for (const k of ['offerId', 'responseId', 'refundQuoteId', 'newOrderId', 'newPnr']) {
        if (k in data) keyIds[k] = (data as Record<string, unknown>)[k];
      }
      if (Object.keys(keyIds).length > 0) {
        this.keyFacts.lastToolKeyIds = keyIds;
      }
    }
  }

  // ===== Pruning =====

  private pruneIfNeeded(): void {
    if (this.contents.length <= this.maxLength) return;

    // Keep only the newest `maxLength` entries
    let trimmed = this.contents.slice(-this.maxLength);

    // If the first kept entry is a functionResponse, its paired functionCall was dropped —
    // drop the orphan response to keep Gemini pairing invariant.
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

  // ===== Internal =====

  private touch(): void {
    this.lastAccessedAt = Date.now();
  }

  // ===== Debug helpers =====

  getLength(): number {
    return this.contents.length;
  }
}

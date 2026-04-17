/**
 * Key-facts extraction — shared across provider-specific session memories.
 *
 * MCP tool results are transport-level JSON strings regardless of which LLM is
 * driving the loop, so the parsing logic is provider-agnostic.
 */

export interface SessionKeyFacts {
  mcpSessionId?: string;
  postBookingTransactionId?: string;
  postBookingOrderId?: string;
  lastToolCalled?: string;
  lastToolKeyIds?: Record<string, unknown>;
}

/**
 * Parse a tool result JSON string and merge newly discovered IDs into `prior`.
 * Returns a new facts object — does not mutate the input.
 */
export function extractKeyFactsFromJsonResult(
  resultText: string,
  prior: SessionKeyFacts,
  toolName: string,
): SessionKeyFacts {
  const next: SessionKeyFacts = { ...prior, lastToolCalled: toolName };

  if (!resultText) return next;

  let parsed: unknown;
  try {
    parsed = JSON.parse(resultText);
  } catch {
    return next; // non-JSON result — nothing to extract
  }

  const root = parsed as Record<string, unknown> | null;
  if (!root || typeof root !== 'object') return next;

  const metadata = (root.metadata && typeof root.metadata === 'object')
    ? (root.metadata as Record<string, unknown>)
    : root;

  if (typeof metadata.sessionId === 'string') {
    next.mcpSessionId = metadata.sessionId;
  }
  if (typeof metadata.transactionId === 'string') {
    next.postBookingTransactionId = metadata.transactionId;
  }

  const data = metadata.data as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    if (typeof data.orderId === 'string') {
      next.postBookingOrderId = data.orderId;
    }

    const keyIds: Record<string, unknown> = {};
    for (const k of ['offerId', 'responseId', 'refundQuoteId', 'newOrderId', 'newPnr']) {
      if (k in data) keyIds[k] = (data as Record<string, unknown>)[k];
    }
    if (Object.keys(keyIds).length > 0) {
      next.lastToolKeyIds = keyIds;
    }
  }

  return next;
}

/**
 * Build the short context hint string injected into system prompts each turn.
 * Returns null when there are no facts to share.
 */
export function buildKeyFactsHint(f: SessionKeyFacts): string | null {
  const parts: string[] = [];
  if (f.mcpSessionId) parts.push(`Prime Booking sessionId: ${f.mcpSessionId}`);
  if (f.postBookingOrderId) parts.push(`Post-Booking orderId: ${f.postBookingOrderId}`);
  if (f.postBookingTransactionId) parts.push(`Post-Booking transactionId: ${f.postBookingTransactionId}`);
  if (f.lastToolCalled) parts.push(`Last tool called: ${f.lastToolCalled}`);
  if (f.lastToolKeyIds && Object.keys(f.lastToolKeyIds).length > 0) {
    const ids = Object.entries(f.lastToolKeyIds)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    parts.push(`Previous tool output IDs: ${ids}`);
  }
  return parts.length ? `[Session context]\n${parts.join('\n')}` : null;
}

/**
 * Agent-loop preamble appended to the system prompt to steer the model
 * toward chaining tools instead of stopping after the first call.
 */
export const AGENT_LOOP_PREAMBLE = `## Agent Loop Mode (CRITICAL — read this first)

You are running in multi-step agent loop mode. You can — and SHOULD — call tools multiple times in sequence to fully satisfy the user's request.

**After you receive a tool result, decide:**
1. Does the user's request need MORE tool calls to be complete? → call the next tool immediately.
2. Have all necessary tools been called AND do you have enough data to answer? → reply with plain text.

**Rules:**
- Chain tools according to the "Workflow Sequence Rules" below (e.g., flight_search → flight_price → seat_availability → select_seat → flight_book).
- Never stop early with text like "now I'll call X" — just call X via function calling / tool use.
- Only reply with plain text when the WHOLE request is complete, or when you need user clarification.
- Use IDs from prior tool results shown in [Session context] — never fabricate IDs.
- If a tool returned isError, decide: retry with corrected args, try a different tool, or explain the failure in plain text.

`;

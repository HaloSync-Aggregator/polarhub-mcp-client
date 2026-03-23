/**
 * Orchestrator
 *
 * v3: Dynamic Tool Discovery + MCP 서버 완전 분리
 *
 * 변경 사항:
 * - Tool 이름 하드코딩 제거 (toolMapping → LLM 경유)
 * - 응답 구조 가정 제거 (범용 metadata 추출)
 * - UI Action을 자연어로 변환하여 LLM이 tool 선택
 */

import { mcpClient, type MCPToolResult } from '../mcp/client.js';
import { createLLMProvider, type LLMProvider, type ConversationContext } from '../llm/index.js';

export interface OrchestratorResult {
  message: string;
  toolResult?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  toolCalled?: string;
  toolSuccess?: boolean;
  error?: string;
}

/**
 * Direct action-to-tool mapping for UI actions
 * These actions bypass LLM parsing for better reliability and performance
 */
interface DirectActionMapping {
  tool: string;
  paramMapper: (payload: Record<string, unknown>) => Record<string, unknown>;
}

const DIRECT_ACTION_MAPPINGS: Record<string, DirectActionMapping> = {
  SelectOffer: {
    tool: 'flight_price',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      offerIndex: payload.offerIndex,
    }),
  },
  SelectCombination: {
    tool: 'flight_price',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      combinationIndex: payload.combinationIndex,
    }),
  },
  EnterPassengers: {
    tool: 'passenger_form',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
    }),
  },
  SelectSeat: {
    tool: 'seat_availability',
    paramMapper: (payload) => ({
      // Post-Booking: orderId 기반 좌석 조회
      order: { orderId: payload.orderId },
      // transactionId는 injectTransactionIdIfNeeded에서 주입됨
      ...(payload.transactionId ? { transactionId: payload.transactionId } : {}),
    }),
  },
  CancelOrder: {
    tool: 'order_cancel',
    paramMapper: (payload) => ({
      orderId: payload.orderId,
      ...(payload.refundQuoteId ? { refundQuoteId: payload.refundQuoteId } : {}),
      ...(payload.transactionId ? { transactionId: payload.transactionId } : {}),
    }),
  },
  ConfirmBooking: {
    tool: 'flight_book',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      passengers: payload.passengers,
      contact: payload.contact,
    }),
  },
  SubmitPassengers: {
    tool: 'flight_book',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      passengers: payload.passengers,
      contact: payload.contact,
    }),
  },
  // Prime Booking: seat selection → select_seat
  SelectPrimeSeat: {
    tool: 'select_seat',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      seatSelections: [
        {
          row: payload.row,
          column: payload.column,
          ...(payload.paxIndex !== undefined ? { paxIndex: payload.paxIndex } : {}),
        },
      ],
    }),
  },
  // Prime Booking: service selection → select_service
  AddPrimeService: {
    tool: 'select_service',
    paramMapper: (payload) => ({
      sessionId: payload.sessionId,
      serviceSelections: [
        {
          serviceIndex: payload.serviceIndex,
          ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
          ...(payload.paxIndex !== undefined ? { paxIndex: payload.paxIndex } : {}),
        },
      ],
    }),
  },
};

/**
 * UI Action을 자연어 설명으로 변환
 * LLM 경유 방식 fallback용 (Direct mapping이 없는 경우)
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  select: '사용자가 검색 결과에서 항공편 오퍼를 선택했습니다',
  select_offer: '사용자가 항공편 오퍼를 선택하여 가격을 확인하려 합니다',
  select_seat: '사용자가 좌석을 선택했습니다',
  confirm_booking: '사용자가 예약을 확정하려 합니다',
  EnterPassengers: '사용자가 승객 정보를 입력하려 합니다. passenger_form 도구를 호출하세요.',
  book: '사용자가 항공편을 예약하려 합니다',
  view_booking: '사용자가 기존 예약 정보를 조회하려 합니다',
  ViewDetails: '사용자가 예약 상세 정보를 조회하려 합니다. order_retrieve 도구를 호출하세요.',
  cancel_booking: '사용자가 예약을 취소하려 합니다',
  submit_passenger: '사용자가 승객 정보를 입력했습니다',
  submit_contact: '사용자가 연락처 정보를 입력했습니다',
  search_flights: '사용자가 항공편을 검색하려 합니다',
};

/**
 * MCP Tool 결과에서 metadata 추출 (범용)
 * 특정 필드 구조를 가정하지 않음
 */
function extractMetadata(result: MCPToolResult): Record<string, unknown> | undefined {
  const structured = result.structuredContent;
  if (!structured) return undefined;

  // metadata 필드가 있으면 사용
  if (typeof structured === 'object' && 'metadata' in structured) {
    return structured.metadata as Record<string, unknown>;
  }

  // 없으면 전체를 metadata로 취급 (sessionId 등 포함)
  return structured as Record<string, unknown>;
}

export class Orchestrator {
  private llmProvider: LLMProvider;
  private conversationContext: Map<string, ConversationContext> = new Map();

  constructor() {
    this.llmProvider = createLLMProvider();
  }

  async initialize(): Promise<void> {
    await mcpClient.connect();
  }

  async shutdown(): Promise<void> {
    await mcpClient.disconnect();
  }

  /**
   * Process user message
   *
   * v3: Dynamic tool discovery
   * 1. Get available tools from MCP server
   * 2. Build dynamic prompt with tool info
   * 3. Parse intent with LLM
   * 4. Call MCP tool and return result
   */
  async processMessage(
    sessionId: string,
    userMessage: string
  ): Promise<OrchestratorResult> {
    let context = this.conversationContext.get(sessionId);
    if (!context) {
      context = { history: [] };
      this.conversationContext.set(sessionId, context);
    }

    context.history.push({
      role: 'user',
      content: userMessage,
    });

    if (context.history.length > 20) {
      context.history = context.history.slice(-20);
    }

    try {
      // v3: Dynamic tool discovery
      const availableTools = mcpClient.getTools();

      // Include context in user message for LLM
      let enrichedMessage = userMessage;
      if (context.mcpSessionId) {
        enrichedMessage = `[Current sessionId: ${context.mcpSessionId}]\n${enrichedMessage}`;
      }
      if (context.postBookingOrderId) {
        enrichedMessage = `[Current orderId: ${context.postBookingOrderId}]\n${enrichedMessage}`;
      }
      if (context.lastToolCalled) {
        enrichedMessage = `[Last tool: ${context.lastToolCalled}]\n${enrichedMessage}`;
      }
      if (context.lastToolResult) {
        const ids = Object.entries(context.lastToolResult)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        if (ids) {
          enrichedMessage = `[Available data from previous tool: ${ids}]\n${enrichedMessage}`;
        }
      }

      const intent = await this.llmProvider.parseIntent(
        enrichedMessage,
        context,
        availableTools
      );

      console.log('Parsed intent:', intent);

      if (intent.clarifications && intent.clarifications.length > 0) {
        const clarificationMessage = intent.clarifications.join('\n');
        context.history.push({
          role: 'assistant',
          content: clarificationMessage,
        });
        return { message: clarificationMessage };
      }

      if (!intent.tool || !intent.params) {
        const response = intent.response || await this.llmProvider.generateResponse(
          userMessage,
          context
        );
        context.history.push({
          role: 'assistant',
          content: response,
        });
        return { message: response };
      }

      // MCP server auto-manages transactionId, but pass context hints if available
      const params = this.injectContextHints(intent.tool, intent.params, context);

      let toolResult: MCPToolResult;
      try {
        toolResult = await mcpClient.callTool(intent.tool, params);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Clear expired sessionId on session-related errors
        if (errorMessage.includes('Session not found') || errorMessage.includes('expired') || errorMessage.includes('session')) {
          context.mcpSessionId = undefined;
          console.log('[Orchestrator] Cleared expired mcpSessionId');
          return {
            message: '세션이 만료되었습니다. 다시 검색해주세요.',
            toolCalled: intent.tool,
            toolSuccess: false,
            error: errorMessage,
          };
        }

        return {
          message: `도구 호출 중 오류가 발생했습니다: ${errorMessage}`,
          toolCalled: intent.tool,
          toolSuccess: false,
          error: errorMessage,
        };
      }

      // v3: 범용 metadata 추출
      const metadata = extractMetadata(toolResult);

      // Note: order_change retry is now handled by MCP server internally
      // Bridge no longer needs retry logic

      // Extract and store sessionId from tool result (Prime Booking)
      if (metadata && typeof metadata.sessionId === 'string') {
        context.mcpSessionId = metadata.sessionId;
        console.log('Stored MCP sessionId:', context.mcpSessionId);
      }

      // Extract and store transactionId from order_retrieve result (Post-Booking)
      // order_retrieve 호출 후 transactionId를 저장하여 후속 작업에 재사용
      if (intent.tool === 'order_retrieve' && metadata) {
        if (typeof metadata.transactionId === 'string') {
          context.postBookingTransactionId = metadata.transactionId;
          console.log('Stored Post-Booking transactionId:', context.postBookingTransactionId);
        }
        // orderId도 저장하여 후속 작업에 사용
        const data = metadata.data as Record<string, unknown> | undefined;
        if (data && typeof data.orderId === 'string') {
          context.postBookingOrderId = data.orderId;
          console.log('Stored Post-Booking orderId:', context.postBookingOrderId);
        }
      }

      // Store last tool result key IDs for context enrichment
      if (metadata && !toolResult.isError) {
        context.lastToolResult = this.extractKeyIdsFromResult(intent.tool, metadata);
        context.lastToolCalled = intent.tool;
      }

      // Prepare data for summarization (exclude rawData to reduce size)
      const dataForSummary = this.prepareDataForSummary(
        toolResult.structuredContent || toolResult.content
      );

      const summary = await this.llmProvider.summarizeResult(
        intent.tool,
        dataForSummary,
        context
      );

      context.history.push({
        role: 'assistant',
        content: summary,
      });

      return {
        message: summary,
        toolResult: toolResult.structuredContent as Record<string, unknown> | undefined,
        metadata,
        toolCalled: intent.tool,
        toolSuccess: !toolResult.isError,
      };

    } catch (error) {
      console.error('Orchestrator error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        message: `요청을 처리하는 중 오류가 발생했습니다: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Process action (e.g., select offer, confirm booking)
   *
   * v4: Direct action-to-tool mapping with LLM fallback
   * - Known actions (SelectOffer, SelectCombination, etc.) bypass LLM parsing
   * - Unknown actions fall back to LLM intent parsing
   */
  async processAction(
    sessionId: string,
    action: string,
    payload: Record<string, unknown>
  ): Promise<OrchestratorResult> {
    // Check for direct action mapping (bypass LLM for known UI actions)
    const directMapping = DIRECT_ACTION_MAPPINGS[action];
    if (directMapping) {
      console.log(`[Orchestrator] Direct action mapping: ${action} → ${directMapping.tool}`);
      return this.executeDirectAction(sessionId, directMapping, payload);
    }

    // Fallback: LLM 경유 방식 for unknown actions
    const actionDescription = ACTION_DESCRIPTIONS[action] || `사용자가 '${action}' 액션을 수행하려 합니다`;
    const message = `${actionDescription}. 데이터: ${JSON.stringify(payload)}`;

    return this.processMessage(sessionId, message);
  }

  /**
   * Execute direct action without LLM parsing
   * Directly calls MCP tool with mapped parameters
   */
  private async executeDirectAction(
    sessionId: string,
    mapping: DirectActionMapping,
    payload: Record<string, unknown>
  ): Promise<OrchestratorResult> {
    let context = this.conversationContext.get(sessionId);
    if (!context) {
      context = { history: [] };
      this.conversationContext.set(sessionId, context);
    }

    try {
      let toolParams = mapping.paramMapper(payload);

      // Pass context hints for Post-Booking tools
      toolParams = this.injectContextHints(mapping.tool, toolParams, context);

      console.log(`[Orchestrator] Calling ${mapping.tool} with params:`, toolParams);

      const toolResult = await mcpClient.callTool(mapping.tool, toolParams);

      // Extract metadata
      const metadata = (toolResult.structuredContent as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined
        || toolResult.structuredContent as Record<string, unknown> | undefined;

      // Store sessionId from result if present
      if (metadata && typeof metadata.sessionId === 'string') {
        context.mcpSessionId = metadata.sessionId;
      }

      // Prepare data for summarization
      const dataForSummary = this.prepareDataForSummary(
        toolResult.structuredContent || toolResult.content
      );

      const summary = await this.llmProvider.summarizeResult(
        mapping.tool,
        dataForSummary,
        context
      );

      context.history.push({
        role: 'assistant',
        content: summary,
      });

      return {
        message: summary,
        toolResult: toolResult.structuredContent as Record<string, unknown> | undefined,
        metadata,
        toolCalled: mapping.tool,
        toolSuccess: !toolResult.isError,
      };

    } catch (error) {
      console.error(`[Orchestrator] Direct action error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        message: `도구 호출 중 오류가 발생했습니다: ${errorMessage}`,
        toolCalled: mapping.tool,
        toolSuccess: false,
        error: errorMessage,
      };
    }
  }

  clearContext(sessionId: string): void {
    this.conversationContext.delete(sessionId);
  }

  /**
   * Post-Booking tools where context hints may be useful
   */
  private static readonly POST_BOOKING_TOOLS = [
    'order_retrieve',
    'seat_availability',
    'service_list',
    'order_reshop',
    'order_quote',
    'order_change',
    'order_cancel',
    'order_prepare',
    'order_confirm',
  ];

  /**
   * Inject context hints for Post-Booking tools (backward compat)
   *
   * MCP server now auto-manages transactionId via PostBookingSessionManager.
   * Bridge only passes existing context hints for backward compatibility.
   * If context has a stored transactionId and params don't, pass it through.
   */
  private injectContextHints(
    toolName: string,
    params: Record<string, unknown>,
    context: ConversationContext
  ): Record<string, unknown> {
    // Only for Post-Booking tools
    if (!Orchestrator.POST_BOOKING_TOOLS.includes(toolName)) {
      return params;
    }

    // Already has transactionId - use as-is
    if (params.transactionId) {
      return params;
    }

    // Pass stored transactionId as hint (MCP server will use its own if not provided)
    if (context.postBookingTransactionId) {
      return { ...params, transactionId: context.postBookingTransactionId };
    }

    // No transactionId - MCP server will auto-generate
    return params;
  }

  /**
   * Extract key IDs from tool result for context enrichment
   * Only keeps IDs that subsequent tools might need
   */
  private extractKeyIdsFromResult(toolName: string, metadata: Record<string, unknown>): Record<string, unknown> {
    const keyIds: Record<string, unknown> = {};

    // Common fields
    if (metadata.sessionId) keyIds.sessionId = metadata.sessionId;
    if (metadata.transactionId) keyIds.transactionId = metadata.transactionId;

    const data = metadata.data as Record<string, unknown> | undefined;
    if (data) {
      if (data.orderId) keyIds.orderId = data.orderId;
      if (data.offerId) keyIds.offerId = data.offerId;
      if (data.responseId) keyIds.responseId = data.responseId;
      // For order_retrieve, extract available actions, paxRefIds, and routes
      if (toolName === 'order_retrieve') {
        if (data.availableActions) {
          keyIds.availableActions = data.availableActions;
        }
        // Extract PaxRefIDs so LLM knows actual passenger IDs
        const dataLists = data.DataLists as Record<string, unknown> | undefined;
        const paxList = dataLists?.PaxList as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(paxList) && paxList.length > 0) {
          keyIds.paxRefIds = paxList.map((p, i) => {
            const paxId = p.PaxRefID || p.PaxID || `PAX${i + 1}`;
            const individual = p.Individual as Record<string, unknown> | undefined;
            const name = individual
              ? `${individual.GivenName || ''} ${individual.Surname || ''}`.trim()
              : '';
            return name ? `${paxId}(${name})` : paxId;
          });
        }
        // Extract route info (origin/dest) for order_reshop params
        const paxJourneyList = dataLists?.PaxJourneyList as Array<Record<string, unknown>> | undefined;
        const paxSegmentList = dataLists?.PaxSegmentList as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(paxJourneyList) && paxJourneyList.length > 0 && Array.isArray(paxSegmentList)) {
          const segMap = new Map<string, Record<string, unknown>>();
          for (const seg of paxSegmentList) {
            const id = (seg.PaxSegmentID || seg.PaxSegmentRefID) as string;
            if (id) segMap.set(id, seg);
          }
          keyIds.routes = paxJourneyList.map((j, i) => {
            const segRefs = (j.PaxSegmentRefID || []) as string[];
            const firstSeg = segRefs.length > 0 ? segMap.get(segRefs[0]) : undefined;
            const lastSeg = segRefs.length > 0 ? segMap.get(segRefs[segRefs.length - 1]) : undefined;
            const dep = firstSeg?.Departure as Record<string, unknown> | undefined;
            const arr = lastSeg?.Arrival as Record<string, unknown> | undefined;
            const origin = dep?.AirportCode || j.OnPoint || '';
            const dest = arr?.AirportCode || j.OffPoint || '';
            const depDate = dep?.Date || '';
            return `${i === 0 ? '가는편' : '오는편'}(${origin}→${dest}, ${depDate})`;
          });
        }
      }
      // For order_reshop refund, extract refundQuoteId for subsequent order_cancel
      if (toolName === 'order_reshop' && data.queryType === 'refund') {
        const refundQuote = (data as Record<string, unknown>).RefundQuote as Record<string, unknown> | undefined;
        if (refundQuote?.RefundQuoteID) {
          keyIds.refundQuoteId = refundQuote.RefundQuoteID;
        }
      }
      // For order_change PNR split, extract new order/PNR info
      if (toolName === 'order_change') {
        const pnrSplit = metadata.pnrSplit as Record<string, unknown> | undefined;
        if (pnrSplit) {
          if (pnrSplit.newOrderId) keyIds.newOrderId = pnrSplit.newOrderId;
          if (pnrSplit.newPnr) keyIds.newPnr = pnrSplit.newPnr;
          if (pnrSplit.originalPnr) keyIds.originalPnr = pnrSplit.originalPnr;
        }
        // Passenger modification metadata
        const paxMod = metadata.passengerModification as Record<string, unknown> | undefined;
        if (paxMod) {
          keyIds.changeType = 'passengerModification';
          if (paxMod.paxId) keyIds.modifiedPaxId = paxMod.paxId;
        }
      }
      // For order_reshop itinerary change, extract reshop options count
      if (toolName === 'order_reshop' && data.queryType !== 'refund') {
        const reshopOffers = (data as Record<string, unknown>).reshopOffers as unknown[] | undefined;
        if (reshopOffers) {
          keyIds.reshopOptionsCount = reshopOffers.length;
          keyIds.queryType = 'itinerary_change';
        }
      }
      // For flight_price repricing, extract selected seats/services
      if (toolName === 'flight_price') {
        const selectedSeats = data.selectedSeats as unknown[] | undefined;
        if (selectedSeats && selectedSeats.length > 0) {
          keyIds.selectedSeats = selectedSeats;
        }
        const selectedServices = data.selectedServices as unknown[] | undefined;
        if (selectedServices && selectedServices.length > 0) {
          keyIds.selectedServices = selectedServices;
        }
      }
    }

    return Object.keys(keyIds).length > 0 ? keyIds : {};
  }

  /**
   * Prepare data for LLM summarization
   * Removes rawData and other verbose fields to keep input size manageable
   */
  private prepareDataForSummary(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const obj = data as Record<string, unknown>;

    // Create a copy without rawData and other verbose fields
    const { rawData, ...cleaned } = obj;

    // For round-trip searches: reorder to put combinations first, reduce offers
    const hasRoundTripCombinations = 'roundTripCombinations' in cleaned
      && Array.isArray(cleaned.roundTripCombinations)
      && (cleaned.roundTripCombinations as unknown[]).length > 0;

    if (hasRoundTripCombinations) {
      const combos = cleaned.roundTripCombinations as Array<Record<string, unknown>>;
      const offers = (cleaned.offers || []) as Array<Record<string, unknown>>;

      // Build a new object with combinations FIRST for LLM attention
      const reordered: Record<string, unknown> = {
        summary: cleaned.summary,
        combinationNote: cleaned.combinationNote,
        roundTripCombinations: combos.slice(0, 5),
        _combinationsNote: combos.length > 5 ? `처음 5개만 표시 (총 ${combos.length}개 조합)` : undefined,
        offers: offers.slice(0, 3),
        _offersNote: offers.length > 3 ? `처음 3개만 표시 (총 ${offers.length}개)` : undefined,
        sessionId: cleaned.sessionId,
        nextStep: cleaned.nextStep,
      };
      // Remove undefined values
      for (const key of Object.keys(reordered)) {
        if (reordered[key] === undefined) delete reordered[key];
      }
      return reordered;
    }

    // For non-round-trip: limit offers to 5
    if ('offers' in cleaned && Array.isArray(cleaned.offers)) {
      const offers = cleaned.offers as Array<Record<string, unknown>>;
      if (offers.length > 5) {
        cleaned.offers = offers.slice(0, 5);
        cleaned._offersNote = `처음 5개만 표시 (총 ${offers.length}개)`;
      }
    }

    return cleaned;
  }

  // Note: buildRefetchParams and buildRetryParams removed
  // order_change retry is now handled internally by MCP server's PostBookingSessionManager
}

// Singleton instance
export const orchestrator = new Orchestrator();

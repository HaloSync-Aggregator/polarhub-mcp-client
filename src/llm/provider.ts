/**
 * LLM Provider Interface
 *
 * v4: MCP Server-Centric Dynamic Prompts
 *
 * 변경 사항:
 * - Tool description에서 워크플로우/키워드 정보 추출
 * - 하드코딩된 가이드라인 최소화
 * - MCP 서버가 single source of truth
 */

import type { MCPTool } from '../mcp/client.js';

/**
 * Conversation context for LLM
 * All booking state is managed by MCP server
 */
export interface ConversationContext {
  history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  // MCP session ID (if returned by tools) - Prime Booking용
  mcpSessionId?: string;
  // Post-Booking용 Transaction ID
  // order_retrieve 호출 시 생성되어 후속 Post-Booking 작업에 재사용
  postBookingTransactionId?: string;
  // Post-Booking용 Order ID
  postBookingOrderId?: string;
  // Last tool result key IDs for context enrichment
  lastToolResult?: Record<string, unknown>;
  // Last tool called (for context enrichment)
  lastToolCalled?: string;
}

export interface IntentResult {
  tool?: string;
  params?: Record<string, unknown>;
  clarifications?: string[];
  response?: string;
  confidence?: number;
}

export interface LLMProvider {
  parseIntent(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[]
  ): Promise<IntentResult>;

  summarizeResult(
    toolName: string,
    result: unknown,
    context: ConversationContext
  ): Promise<string>;

  generateResponse(
    userMessage: string,
    context: ConversationContext
  ): Promise<string>;
}

/**
 * Extract intent keywords from tool description
 */
function extractIntentKeywords(tool: MCPTool): string[] {
  const desc = tool.description;

  // Extract ## 키워드 section (multiline)
  const keywordMatch = desc.match(/## 키워드\s*\n([\s\S]*?)(?=\n##|\nCRITICAL|\n\n\n|$)/);
  if (keywordMatch) {
    // Parse keywords from the block
    return keywordMatch[1]
      .split(/[,，\n]/)
      .map(k => k.replace(/["'"→→]/g, '').replace(/→.*$/, '').trim())
      .filter(k => k.length > 0 && !k.startsWith('→'));
  }

  return [];
}

/**
 * Build tool selection guide from tool metadata
 */
function buildToolSelectionGuide(tools: MCPTool[]): string {
  const guides: string[] = [];

  for (const tool of tools) {
    const keywords = extractIntentKeywords(tool);
    if (keywords.length > 0) {
      guides.push(`- "${keywords.join('", "')}" → **${tool.name}**`);
    }
  }

  return guides.join('\n');
}

/**
 * Dynamic prompt builder for MCP tools
 *
 * v4: Tool description에서 워크플로우/키워드 추출
 * - 하드코딩 최소화
 * - MCP 서버의 tool description이 단일 소스
 */
export function buildIntentParserPrompt(tools: MCPTool[]): string {
  const toolDescriptions = tools.map(t => {
    return `### ${t.name}\n${t.description}`;
  }).join('\n\n');

  const toolSelectionGuide = buildToolSelectionGuide(tools);
  const today = new Date().toISOString().split('T')[0];

  return `You are an MCP (Model Context Protocol) assistant that helps users interact with available tools.

## Available MCP Tools

${toolDescriptions}

## Your Job

1. Understand the user's intent from their message
2. Determine which tool (if any) should be called
3. Extract parameters according to the tool's inputSchema
4. Ask for clarification if required parameters are missing

## Tool Selection Guide (from MCP metadata)
${toolSelectionGuide}

## Workflow Sequence Rules (CRITICAL)

### Prime Booking (신규 예약)
- flight_price 후 "좌석 보여줘" → **seat_availability** (sessionId 전달)
- flight_price 후 "서비스 보여줘" → **service_list** (sessionId 전달)
- seat_availability 후 "12A 좌석", "좌석 선택해줘" → **select_seat** (seatSelections 포함)
- service_list 후 "수하물 추가", "1번 서비스", "N번 서비스 추가해줘" → **select_service** (serviceSelections 포함) — service_list 재호출 금지!
- seat_availability 후 "41A로", "좌석 선택해줘" → **select_seat** — seat_availability 재호출 금지!
- select_seat/select_service 후 "예약해줘" → **flight_book**

#### ⚠️ 조회 → 선택 도구 혼동 방지 (CRITICAL)
- service_list 결과가 이미 있으면: "서비스 추가/선택/N번" → **select_service** (절대 service_list 재호출 아님!)
- seat_availability 결과가 이미 있으면: "좌석 선택/N번 좌석" → **select_seat** (절대 seat_availability 재호출 아님!)
- order_reshop 결과가 이미 있으면: "N번 옵션으로 변경" → **order_prepare** (절대 order_reshop 재호출 아님!)

### MANDATORY Prime Booking Rules (절대 위반 금지)

#### 좌석/서비스 선택은 전용 도구 사용
- 좌석 선택: seat_availability → **select_seat** (flight_price가 아님!)
- 서비스 선택: service_list → **select_service** (flight_price가 아님!)
- flight_price는 오퍼 선택 전용 (offerIndex만 사용)

#### ⚠️ 좌석+서비스 동시 선택 시 순서 (CRITICAL — 강제사항)
- 서비스를 반드시 좌석보다 먼저 선택해야 합니다!
- 올바른 순서: service_list → select_service → seat_availability → select_seat → flight_book ✅
- 잘못된 순서: seat_availability → select_seat → service_list → select_service → flight_book ❌

#### 예시
- "좌석이랑 서비스 다 추가해줘" → service_list → select_service → seat_availability → select_seat → flight_book ✅
- "35A 좌석 선택하고 예약해줘" → seat_availability → select_seat → flight_book ✅
- "좌석 보여줘" → seat_availability → (좌석 안 살래) → flight_book ✅
- "35A 좌석 선택해줘" → seat_availability → flight_price ❌ (select_seat 사용!)

### Post-Booking (예약 변경) — 2-Phase 패턴 필수
- order_retrieve 후 "날짜 변경하려면?", "변경 옵션 보여줘", "환불하면 얼마?" → **order_reshop** (옵션 조회)
- order_reshop 결과가 이미 있으면: "1번 옵션으로 변경해줘", "N번 옵션", "변경 진행해" → **order_prepare** (절대 order_reshop 재호출 아님!)
- order_prepare 후 → 사용자 확인 → **order_confirm** (결제 실행)
- 좌석/서비스 변경도 동일: **order_prepare** → **order_confirm**
- 발권(delay ticketing)도 동일: **order_prepare** → **order_confirm**
- **order_change는 PNR 분리/승객 정보 변경에만 사용** (즉시 실행, confirm 불필요)
- order_reshop 환불 견적 결과가 이미 있으면: "환불 진행해줘", "취소해줘", "네" → **order_cancel** (절대 텍스트 응답만으로 환불 완료 처리 금지!)
- order_retrieve를 연속 2회 호출하지 마세요. 이미 조회된 상태에서 변경/환불 관련 요청은 order_reshop입니다.
- order_retrieve 후 좌석/서비스 관련 요청 → **seat_availability** 또는 **service_list**

## General Rules

- Use the tool's inputSchema to determine required vs optional parameters
- NEVER generate or fabricate IDs - only use IDs that the server returns
- **CRITICAL: If a sessionId is provided in the message (e.g., [Current sessionId: sess_xxx]), you MUST use that exact sessionId**
- Do not make up fake sessionIds like "sess_0123456789abcdef" - always use the real one from context
- **CRITICAL: Prime Booking에서 seat_availability, service_list 호출 시 sessionId만 전달하세요. offer 객체를 직접 채우지 마세요!** 서버가 세션에서 offerId, responseId, owner, offerItems를 자동 주입합니다. offer를 직접 채우면 잘못된 ID(hallucination)가 전달되어 API가 실패합니다.
- Convert city names to IATA airport codes (e.g., Seoul → ICN, Tokyo → NRT)
- Convert relative dates to YYYY-MM-DD format
- transactionId는 시스템이 자동 주입합니다. params에 transactionId를 포함하지 마세요.
- orderId는 반드시 order_retrieve 결과에서 제공된 값을 그대로 사용하세요. 절대 임의로 생성하지 마세요.

## order_change Parameter Mapping (PNR 분리/승객 변경 전용)

order_change는 PNR 분리와 승객 정보 변경에만 사용합니다. 좌석/서비스/일정/발권은 order_prepare → order_confirm을 사용하세요.

### 승객 정보 변경 (passengerModification)
이메일, 전화번호, 이름, 여권 변경 시 반드시 **passengerModification** 파라미터 포함:
- paxId는 Context의 paxRefIds에서 실제 값 사용 (PAX1이 아닐 수 있음, PAX2 등)
- "첫번째 승객" = paxRefIds 배열의 첫 번째 ID
\`\`\`json
{ "orderId": "...", "passengerModification": { "paxId": "PAX2", "email": "new@email.com" } }
{ "orderId": "...", "passengerModification": { "paxId": "PAX2", "phone": "01012345678" } }
\`\`\`

### 기타 변경 유형
- 좌석 변경 → **seatSelection** 필수
- 서비스 추가 → **serviceSelection** 필수
- 일정 변경 옵션 확정 → **optionSelection** 필수
- 발권 확정 → **delayTicketing** 필수 (반드시 객체로 전달)
\`\`\`json
{ "orderId": "...", "delayTicketing": { "confirm": true } }
\`\`\`
- 승객 분리 → **pnrSplit** 필수

## Response Format

When no tool is appropriate, respond with a natural language message in Korean.
When you need clarification, ask the user directly in Korean.
Tool selection and parameter extraction are handled automatically via function calling.

Today's date: ${today}`;
}

/**
 * Get minimal tool-specific guidelines
 * These are kept minimal as most guidance is now in tool descriptions
 */
function getToolSpecificGuidelines(toolName: string): string {
  // Minimal guidelines - most info is in tool description
  const guidelines: Record<string, string> = {
    flight_search: `## 출력 규칙

### 왕복 검색 결과 (roundTripCombinations가 있을 때)
[중요] combinationNote 필드의 지시를 반드시 따르세요.

출력 순서:
1. 요약: "왕복 조합 N개 + 통합운임 M개 검색" (총 결과 요약)
2. **왕복 조합 (roundTripCombinations)** 상세를 먼저:
   - 가격순으로 상위 3~5개 조합의 편명, 출발/도착 시간, 경유 여부, 왕복 총액을 반드시 나열
   - 예시 형식:
     **조합 1** (왕복 358,063원)
     · 가는편: TR 897 | 04/22 23:00→04:15(+1) | 경유 1회
     · 오는편: TR 876 | 04/29 01:00→08:50 | 경유 1회
3. **왕복 통합운임 (offers[])** 을 그 다음:
   - Full 오퍼의 상세 (편명/시간/가격 등)
4. 다음 단계 안내

[필수] 조합의 편명, 시간, 가격 등은 반드시 JSON 데이터(roundTripCombinations[].outbound/inbound)에서 그대로 인용하세요. 데이터에 없는 정보를 추측하거나 지어내지 마세요.
[금지] roundTripCombinations 상세를 생략하고 "궁금하시면 알려드릴게요"라고 뒤로 미루지 마세요.

### 편도/일반 검색 결과 (roundTripCombinations가 없을 때)
- 모든 항공편을 번호와 함께 상세히 나열
- 가격, 시간, 운임 등급, 수하물 정보 포함

### 공통
- sessionId는 맨 마지막에 간략히 언급
- 가격은 항상 천 단위 콤마 표시 (예: 364,000원)
- 수하물: baggage 필드가 있으면 위탁/기내 구분 표시 (예: "위탁 23kg 1개 / 기내 7kg")
- 운임 등급: priceClass.name 필드가 있으면 표시 (예: "Economy Saver")
- 데이터에 없는 필드(priceClass, baggage, farePolicy 등)는 언급하지 말 것`,

    flight_price: `## 출력 규칙
- 확정 가격: baseFare(운임) + taxes(세금) 분리 표시, 1인당 + 총액
- 운임 등급: fareClass — fareBasisCode, cabinTypeName, rbd(예약 클래스) 표시
- **운임 규정 (farePolicy) 필수 표시** (데이터에 있을 때):
  - 환불 가능 여부: refundable (가능/불가)
  - 변경 가능 여부: changeable (가능/불가)
  - penalties[] 상세: 각 항목의 type(Change/Cancel), amount, currency 표시
    예: "변경 수수료: 71,600원 (출발 후), 취소 수수료: 143,200원 (출발 전)"
  - timingCode "1" = 출발 전, "2" = 출발 후
  - remarks[] 텍스트 규정이 있으면 요약 표시 (전문은 너무 길면 핵심만)
- 결제 기한: paymentDeadline을 "YYYY년 MM월 DD일 HH:MM까지" 형식으로 강조
- segments[] 여정 상세: 각 구간의 편명, 출발/도착 공항+터미널, 시간, 비행시간
- 다음 단계 3가지 선택지 필수 안내:
  1. 좌석 선택 → "좌석 보여줘"
  2. 서비스 추가 → "서비스 목록 보여줘"
  3. 바로 예약 → 승객 정보 요청 (영문 이름, 생년월일, 여권번호, 이메일, 전화번호)
- 데이터에 없는 필드는 생략`,

    select_seat: `## 출력 규칙
- 선택된 좌석 번호 명확히 표시
- 좌석 추가 요금 안내 (0원이면 "무료")
- 갱신된 총 가격(updatedPrice) 강조
- 다음 단계 안내:
  - 서비스 추가 → "서비스 목록 보여줘"
  - 바로 예약 → 승객 정보 요청
- 좌석 유형(창가/복도)은 응답 데이터에 없으므로 추측하지 말 것`,

    select_service: `## 출력 규칙
- 추가된 서비스명 + 수량 표시 (예: "위탁 수하물 23kg × 1개")
- 서비스 추가 요금 안내
- 갱신된 총 가격(updatedPrice) 강조
- 다음 단계 안내:
  - 좌석 선택 → "좌석 보여줘"
  - 바로 예약 → 승객 정보 요청`,

    flight_book: `## 출력 규칙
- **예약 상태** 명확히: bookingState "HELD" = "미발권 (기한 내 발권 필요)", "TICKETED" = "발권 완료"
- **PNR (항공사 예약번호)** 크게 강조 — 항공사 웹사이트/공항 체크인용
- **OrderID (주문 ID)** 표시 — 좌석 선택, 수하물 추가, 일정 변경 등 Post-Booking 작업용
- 발권 기한(ticketTimeLimit): "YYYY년 MM월 DD일 HH:MM까지" (HELD일 때 강조)
- 티켓 번호(ticketNumbers): 발권 완료 시 표시
- **확정 여정 필수 표시**: rawData의 세그먼트 정보로 각 구간의 편명, 출발/도착(공항+시간+날짜) 표시
- **탑승객 상세**: 이름, 유형, 생년월일, 연락처(이메일+전화), 여권번호/만료일
- **운임 규정**: rawData에 FareComponent.Penalty가 있으면 환불/변경 가능 여부 + 수수료 표시
- **구매 부가서비스 (ancillaries)**: 데이터에 있으면 반드시 표시!
  - 좌석: "좌석: 23A (PAX1, SEG1)" 형태
  - 서비스: "수하물: Carry On Bag (PAX1)" 형태
- 총 결제 금액 (baseFare + taxes 분리 가능 시)
- 마무리: "예약 조회, 좌석 선택, 수하물 추가 시 OrderID를 사용하세요!"`,

    order_retrieve: `## 출력 규칙
- **예약 상태**: bookingState(HELD/TICKETED) + orderStatus 명확히 표시
- **PNR + OrderID** 강조
- **확정 여정**: flights[] 배열의 각 세그먼트 — 편명, 출발/도착 공항+시간+날짜 필수 표시
- **탑승객 상세**: passengers[] — 이름, 유형(성인/소아/유아), paxRefId
- **운임 정보**: totalPrice(총액), baseFare/taxes 분리 가능 시
- **발권 기한**: ticketTimeLimit (HELD일 때 강조)
- **티켓 번호**: ticketNumbers (TICKETED일 때)
- **운임 규정**: rawData에 FareComponent.Penalty가 있으면 환불/변경 가능 여부 + 수수료 표시
- **구매 부가서비스 (ancillaries)**: 데이터에 있으면 반드시 표시!
  - 좌석: "좌석: 23A (PAX1, SEG1)" 형태
  - 서비스: "수하물: Carry On Bag (PAX1)" 형태
  - 없으면 "추가 부가서비스: 없음" 으로 표시
- **가능한 작업**: availableActions 기반으로 안내 (좌석변경, 수하물추가, 일정변경, 환불 등)`,

    seat_availability: `## 출력 규칙
- 총 가용 좌석 수
- 좌석 유형별 분류 (창가, 복도, 비상구) + 가격대
- 추천 좌석 2~3개 (최저가 기준)
- 가격이 전 좌석 동일하면 간결하게 "전 좌석 동일 가격: XX,000원" 표시
- 선택 방법: "좌석번호 말씀해주세요 (예: 41A 선택해줘)"
- TICKETED 주문: "좌석 선택 시 견적 확인이 자동으로 포함됩니다" 안내`,

    service_list: `## 출력 규칙
- 카테고리별 그룹핑 (수하물, 기내식, 기타)
- 각 서비스에 인덱스 번호 부여: [1], [2], [3]
- 가격 + 단위 필수 (원/개, 원/구간)
- bookingInstructions는 기술 정보이므로 생략
- 선택 방법: "서비스 번호 말씀해주세요 (예: 1번 추가)"
- TICKETED 주문: "서비스 추가 시 견적 확인이 자동으로 포함됩니다" 안내`,

    order_change: `## 출력 규칙
- 변경 완료 메시지
- 추가 금액 강조
- PNR 표시
- 좌석 변경 성공 시: 선택한 좌석번호 + 좌석 특성(창가/복도) + 추가 금액 안내
- 서비스 추가 성공 시: 추가된 서비스명 + 수량 + 추가 금액 안내
- 일정 변경 성공 시: 새 항공편 정보(편명, 날짜, 시간) + 변경 전/후 비교 + 추가 결제/환불 금액 안내
- PNR 분리 성공 시: **새 PNR** 크게 강조, 원래 PNR 참조, 분리된 승객 목록 표시
  - ADT+INF 쌍은 ADT만 지정하면 유아가 자동 이동됨을 안내
  - 새 주문 조회 방법 안내 ("새 주문 {newOrderId} 조회해줘")
- 승객 정보 변경 성공 시: 변경된 항목을 명확히 표시
  - "PAX1 승객의 이메일이 xxx@email.com으로 변경되었습니다"
  - 결제 없음 안내 ("추가 비용 없이 변경 완료")
- "다른 좌석이나 서비스가 필요하시면 말씀해주세요!" 로 마무리`,

    order_quote: `## 출력 규칙
- 견적 총 금액 강조
- 추가 결제 금액 표시
- 구매 확정 방법 안내 ("네, 구매 확정해줘" 등)`,

    order_reshop: `## 왕복 일정 변경
- 왕복 예약에서 한 구간만 변경 시, **변경할 구간만** originDestList에 포함
- 미변경 구간은 서버가 자동 처리 (RetainServiceID, OriginDestList 자동 보정)
- 예: 귀국편 날짜만 변경 → originDestList에 귀국편만 포함

## 출력 규칙

### 환불 견적 조회 (queryType === 'refund')
- **환불 예상 금액** 크게 강조 (예: "환불 예상 금액: 364,000원")
- **위약금** 별도 표시 (있는 경우)
- **실수령 환불액** = 환불 금액 - 위약금
- 환불 소요 시간: "결제 수단에 따라 3-5영업일 소요"
- **반드시 사용자 확인 요청**: "환불을 진행하시겠습니까?" (자동 진행 금지)
- 사용자가 환불 진행을 확인하면 **반드시 order_cancel 도구를 호출**해야 합니다. 텍스트 응답만으로 환불 완료 처리 절대 금지!
- 위약금 0인 경우: "위약금 없이 전액 환불됩니다" 명시

### 일정 변경 옵션 조회 (queryType !== 'refund')
- 옵션 번호 매기기 (1번, 2번, ...)
- 각 옵션의 항공편 정보: 편명, 출발/도착 시간, 경유 여부
- **가격 차액 필수**: +XXX원 / -XXX원 / 추가 비용 없음
- "원하시는 옵션 번호를 말씀해주세요!" 로 마무리
- **자동 변경 금지**: 사용자가 옵션을 선택한 후에만 order_prepare 호출 (order_change 아님!)`,

    order_cancel: `## 출력 규칙

### HELD 예약 취소 (미결제)
- "예약이 정상적으로 취소되었습니다" 반드시 포함
- 주문번호(OrderID) 표시
- 미결제 예약이므로 환불 관련 안내 불필요
- 간결하게 마무리 ("다른 도움이 필요하시면 말씀해주세요")

### TICKETED 예약 취소 (환불)
- "예약이 취소되었으며 환불이 진행됩니다" 반드시 포함
- **환불 금액** 크게 강조
- **위약금** 별도 표시 (있는 경우)
- **실수령 환불액** (환불 금액 - 위약금)
- **환불 예상 일정**: "결제 수단에 따라 3-5영업일 이내 처리됩니다"
- 환불 완료 후 추가 조치 없음을 안내

### 공통
- 에러 발생 시 원인과 다음 단계 안내
- "취소" 키워드 반드시 포함`,
  };

  return guidelines[toolName] || `## 일반 출력 규칙
- 핵심 정보 먼저
- 다음 가능한 액션 안내`;
}

/**
 * Smart JSON-aware truncation
 * Tries to truncate at array element boundaries to preserve JSON structure
 */
function smartTruncateJson(jsonStr: string, maxLength: number): string {
  if (jsonStr.length <= maxLength) return jsonStr;

  // Try to find last complete array element or object before limit
  const cutPoint = maxLength - 50; // Leave room for truncation notice
  const truncated = jsonStr.substring(0, cutPoint);

  // Find the last closing brace/bracket before a comma
  const lastCleanCut = Math.max(
    truncated.lastIndexOf('},'),
    truncated.lastIndexOf('],'),
  );

  if (lastCleanCut > cutPoint * 0.5) {
    return truncated.substring(0, lastCleanCut + 1) + '\n  ...(truncated, showing partial data)';
  }

  return truncated + '...(truncated)';
}

export function buildResultSummarizerPrompt(toolName: string, result: unknown): string {
  const resultStr = JSON.stringify(result, null, 2);
  const MAX_RESULT_LENGTH = 8000;
  const truncated = resultStr.length > MAX_RESULT_LENGTH
    ? smartTruncateJson(resultStr, MAX_RESULT_LENGTH)
    : resultStr;

  const toolGuidelines = getToolSpecificGuidelines(toolName);

  return `당신은 친절하고 전문적인 항공 예약 어시스턴트입니다.
MCP 도구 실행 결과를 사용자에게 자연스럽고 유용하게 요약해주세요.

## 도구 실행 결과
도구: ${toolName}
\`\`\`json
${truncated}
\`\`\`

${toolGuidelines}

## 공통 규칙
1. **언어**: 반드시 한국어로 응답
2. **어투**: 친근하고 자연스러운 존댓말 ("~습니다", "~세요")
3. **형식**: 읽기 쉬운 문단 형태, 핵심 정보는 강조
4. **가격 표시**: 천 단위 콤마 포함, 통화 표시 (예: 364,000원)
5. **시간 표시**: 24시간 형식 (예: 16:45)
6. **다음 단계**: 사용자가 뭘 해야 하는지 명확히 안내
7. **에러 시**: 원인을 친절하게 설명하고 해결 방법 제시

## 주의사항
- JSON 데이터를 그대로 나열하지 마세요
- 불필요한 기술적 정보(offerItemId 등)는 생략
- sessionId는 "세션 ID: xxx" 형태로 간략히 언급
- 너무 길지 않게, 핵심만 전달

한국어로 요약해주세요:`;
}

export function buildGeneralResponsePrompt(context: ConversationContext, tools: MCPTool[]): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description.split('\n')[0]}`).join('\n');
  const historyStr = context.history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n');

  return `You are a friendly MCP assistant.

Available tools:
${toolList}

Recent conversation:
${historyStr}

Respond naturally in Korean. If the user wants to perform an action, guide them on what information you need based on the available tools.`;
}

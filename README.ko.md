# PolarHub MCP Client

[English](./README.md) | **한국어**

> **"항공편 검색해줘"** 한 마디로 시작하는 AI 항공 예약

NDC(New Distribution Capability) 기반 항공 예약 MCP 서버를 위한 **AI 채팅 클라이언트**입니다.
자연어로 항공편 검색, 예약, 좌석 선택, 서비스 추가, 일정 변경, 환불까지 — 항공 예약의 전체 라이프사이클을 대화형으로 수행합니다.

> **🔗 Links**
>
> | | |
> |---|---|
> | **HaloSync** | [halosync.kr](https://halosync.kr/) |
> | **API Documentation** | [doc.halo-platform.net](https://doc.halo-platform.net/) |

---

## 왜 이 프로젝트가 필요한가?

항공 예약 시스템은 복잡합니다. NDC API는 수십 개의 엔드포인트, 항공사마다 다른 파라미터, 예약 → 발권 → 변경 → 환불로 이어지는 다단계 워크플로우를 가집니다. 개발자가 이를 직접 다루려면 방대한 도메인 지식이 필요합니다.

**PolarHub MCP Client는 이 복잡성을 자연어 대화 뒤로 숨깁니다.**

| 기존 방식 | 이 프로젝트 |
|-----------|------------|
| NDC API 스펙 학습 → 엔드포인트별 요청/응답 직접 구현 | **"서울에서 싱가포르 4월 15일 항공편 검색해줘"** |
| 예약 상태 머신 직접 관리 (HELD → TICKETED → CANCELLED) | AI가 워크플로우 자동 관리 |
| 항공사별 예외 처리 코드 작성 | MCP 서버가 항공사 패턴 추상화 |

### 이 프로젝트로 얻을 수 있는 것

- **즉시 사용 가능한 항공 예약 AI 채팅 UI** — 설치 후 바로 40+ 항공사 검색/예약
- **MCP 프로토콜 레퍼런스 구현** — LLM ↔ MCP 서버 연동의 실제 동작 코드
- **멀티 LLM 지원** — OpenAI, Gemini, Bedrock 중 선택, 동일한 인터페이스
- **프로덕션 수준의 세션 관리** — 다단계 예약 워크플로우의 상태 추적

---

## 핵심 개념

이 프로젝트를 이해하려면 두 가지 개념을 알아야 합니다.

### NDC (New Distribution Capability)

IATA가 정의한 항공 유통 표준입니다. 항공사가 가격, 좌석, 부가서비스를 직접 제공할 수 있게 하는 XML/JSON 기반 API 규격입니다. PolarHub는 이 NDC API를 40+ 항공사에 대해 통합 제공합니다.

### MCP (Model Context Protocol)

Anthropic이 제안한 **LLM과 외부 도구를 연결하는 표준 프로토콜**입니다. LLM이 "어떤 Tool을 호출할지" 결정하면, MCP 클라이언트가 MCP 서버의 해당 Tool을 실행합니다. 이 프로젝트는 MCP 클라이언트 역할을 합니다.

```
LLM: "flight_search를 호출해야겠다"
  → MCP Client (이 프로젝트): flight_search Tool 실행 요청
    → MCP Server: PolarHub NDC API 호출 → 결과 반환
```

---

## 이 프로젝트는 무엇인가?

PolarHub MCP Client는 [Model Context Protocol(MCP)](https://modelcontextprotocol.io/) 기반 항공 예약 서버에 연결하는 **웹 클라이언트 애플리케이션**입니다.

<p align="center">
  <img src="docs/overview.svg" alt="Project Overview" width="520"/>
</p>

**MCP 서버 없이는 동작하지 않습니다.** 이 클라이언트는 MCP 서버가 제공하는 Tool을 호출하여 모든 기능을 수행합니다.

이 README는 **외부 OTA 개발자가 PolarHub MCP Client를 실행하거나, 동일한 상호작용 계약을 자체 프론트엔드/백엔드에 통합할 때 필요한 정보**를 기준으로 작성되어 있습니다. 예제 UI 실행법뿐 아니라 WebSocket 메시지 형식, 세션 유지 방식, 인증 헤더 전달 방식까지 함께 설명합니다.

---

## 주요 기능

### 예약 생성 (Prime Booking)

| 기능 | 설명 | 호출되는 MCP Tool |
|------|------|:----------------:|
| **항공편 검색** | 출발지/도착지/날짜로 항공편 검색 | `flight_search` |
| **가격 확정** | 검색 결과에서 오퍼 선택, 가격 확정 | `flight_price` |
| **좌석 선택** | 좌석 배치도에서 좌석 선택 | `select_seat` |
| **서비스 추가** | 수하물, 기내식 등 부가서비스 선택 | `select_service` |
| **예약 완료** | 승객 정보 입력 후 예약 생성 (PNR 발급) | `flight_book` |

```
"서울에서 싱가포르 4월 15일 성인 1명"
  → flight_search → flight_price → select_seat → flight_book
```

### 예약 관리 (Post-Booking)

| 기능 | 설명 | 호출되는 MCP Tool |
|------|------|:----------------:|
| **예약 조회** | PNR/주문번호로 예약 상세 확인 | `order_retrieve` |
| **좌석 변경** | 예약 후 좌석 변경 | `seat_availability` → `order_prepare` → `order_confirm` |
| **서비스 추가** | 예약 후 부가서비스 추가 | `service_list` → `order_prepare` → `order_confirm` |
| **일정 변경** | 다른 날짜/항공편으로 변경 | `order_reshop` → `order_prepare` → `order_confirm` |
| **발권** | HELD 예약을 TICKETED로 전환 | `order_prepare` → `order_confirm` |
| **환불** | 예약 취소 및 환불 | `order_reshop` → `order_cancel` |
| **PNR 분리** | 멀티 승객 예약에서 특정 승객 분리 | `order_prepare` |
| **승객 정보 변경** | 이메일, 전화번호, 여권 등 수정 | `order_prepare` |

```
"주문 ORD_12345 좌석 12A로 변경해줘"
  → order_retrieve → seat_availability → order_prepare → (확인) → order_confirm
```

---

## 동작 원리

사용자가 메시지를 보내면 어떤 일이 일어나는지, 단계별로 설명합니다.

### 1단계: 의도 파악 (Intent Parsing)

사용자의 자연어를 LLM이 분석하여 **어떤 MCP Tool을 호출할지** 결정합니다.

```
사용자: "싱가포르 왕복 4월 15일 출발 4월 20일 도착"
                    ↓
LLM 분석: tool = "flight_search"
          params = { origin: "ICN", destination: "SIN",
                     departureDate: "2026-04-15", returnDate: "2026-04-20" }
```

핵심은 **동적 Tool Discovery**입니다. Tool 목록이 코드에 하드코딩되어 있지 않고, 시작 시 MCP 서버에서 사용 가능한 Tool과 설명을 가져와 LLM 프롬프트를 자동 생성합니다. MCP 서버에 새 Tool이 추가되면 클라이언트 수정 없이 자동 반영됩니다.

### 2단계: MCP Tool 호출

결정된 Tool을 MCP 서버에 실행 요청합니다. Streamable HTTP transport로 통신하며, PolarHub 인증 정보는 `X-PolarHub-*` HTTP 헤더로 pass-through합니다.

```
MCP Client → POST /mcp
  Headers: X-PolarHub-Tenant-ID, X-PolarHub-API-Secret, ...
  Body: { method: "tools/call", params: { name: "flight_search", arguments: {...} } }
```

### 3단계: 결과 요약

MCP 서버가 반환한 결과를 LLM이 사용자 친화적으로 요약합니다:

- **텍스트 응답** — LLM이 결과를 한국어로 요약 (가격은 천 단위 콤마, 시간은 24시간 형식)

---

## 아키텍처

<p align="center">
  <img src="docs/architecture.svg" alt="Architecture" width="640"/>
</p>

### 핵심 모듈 역할

| 모듈 | 파일 | 역할 |
|------|------|------|
| **Orchestrator** | `src/orchestrator/index.ts` | 전체 흐름 제어. 의도 파싱 → Tool 호출 → 결과 요약 → 세션 상태 관리 |
| **MCP Client** | `src/mcp/client.ts` | MCP 서버 연결, Tool 호출, 정적 헤더 인증, 재연결 로직 |
| **LLM Provider** | `src/llm/provider.ts` | 3개 LLM 제공자 공통 인터페이스 + 동적 프롬프트 빌더 |
| **WebSocket** | `src/server/websocket.ts` | 클라이언트 세션 관리, 메시지 라우팅, 메타데이터 전파 |

### 데이터 흐름

1. **사용자** → 자연어 메시지 (WebSocket)
2. **Orchestrator** → LLM에 의도 파싱 요청 (어떤 Tool을 호출할지?)
3. **LLM** → Tool 이름 + 파라미터 반환
4. **MCP Client** → MCP 서버에 Tool 호출 (Streamable HTTP)
5. **MCP Server** → PolarHub NDC API 호출 → 결과 반환
6. **Orchestrator** → LLM에 결과 요약 요청 → 사용자 친화적 텍스트 생성
7. **Frontend** → 텍스트 응답 표시

---

## 설계 원칙

코드를 이해하는 데 도움이 되는 핵심 설계 결정들입니다.

### Dynamic Tool Discovery — 하드코딩 없는 Tool 연동

```typescript
// src/orchestrator/index.ts
const tools = await this.mcpClient.getTools();  // MCP 서버에서 Tool 목록 조회
const prompt = buildIntentParserPrompt(tools);   // Tool 설명으로 LLM 프롬프트 자동 생성
```

Tool 이름, 파라미터, 설명이 전부 MCP 서버에서 옵니다. 새 Tool이 추가되거나 설명이 바뀌어도 이 클라이언트를 수정할 필요가 없습니다.

### Two-Phase Post-Booking — 조회 → 미리보기 → 실행

예약 변경은 실수를 방지하기 위해 반드시 **2단계**를 거칩니다:

```
조회 (order_reshop)  → "변경하면 50,000원 추가됩니다"
미리보기 (order_prepare)  → "이대로 변경할까요?" [확인/취소]
실행 (order_confirm)  → "변경 완료!"
```

### Stateful Session — 다단계 워크플로우 상태 추적

```typescript
// Orchestrator가 세션별로 추적하는 컨텍스트
{
  mcpSessionId: "...",              // Prime Booking 세션
  postBookingTransactionId: "...",  // Post-Booking 트랜잭션
  postBookingOrderId: "...",        // 현재 관리 중인 주문
  lastToolResult: {...},            // 이전 Tool 결과 (다음 호출에 활용)
}
```

각 Tool 호출 결과에서 sessionId, transactionId, orderId 등을 자동 추출하여 저장합니다. 사용자가 "좌석 변경해줘"라고만 해도, 이전 문맥에서 어떤 주문의 어떤 세그먼트인지 자동으로 파악합니다.

---

## WebSocket 프로토콜

프론트엔드 ↔ 백엔드 간 실시간 통신 규격입니다.

### Client → Server

```typescript
// 자연어 메시지
{ type: "user_message", id: "uuid", content: "항공편 검색해줘", timestamp: 1234567890 }

// 권장: 액션 (버튼 클릭, 현재 번들 프론트엔드가 사용하는 방식)
{ type: "action", id: "uuid", action: "SelectOffer", payload: { sessionId: "sess_xxx", offerIndex: 1 }, transactionId: "client_tx_1" }

// 권장: 폼 완료도 action으로 전송
{ type: "action", id: "uuid", action: "SubmitPassengers", payload: { sessionId: "sess_xxx", passengers: [...], contact: {...} }, transactionId: "client_tx_1" }

// 레거시 호환: form_submit도 서버가 수용
{ type: "form_submit", id: "uuid", formType: "passenger", data: { passengers: [...] }, transactionId: "client_tx_1" }
```

### Server → Client

```typescript
// 연결 성공
{ type: "connection", status: "connected", sessionId: "sess_abc" }

// AI 응답 (텍스트 + 구조화 데이터)
{ type: "assistant_message", id: "uuid", content: "검색 결과입니다.", toolResult: {...}, metadata: {...} }

// Tool 호출 시작/종료 (로딩 표시용)
{ type: "tool_call_start", id: "uuid", toolName: "flight_search" }
{ type: "tool_call_end",   id: "uuid", toolName: "flight_search", success: true }

// 에러
{ type: "error", id: "uuid", code: "MCP_ERROR", message: "서버 연결 실패" }
```

통합 시 알아둘 점:

- `transactionId`는 **클라이언트 대화 단위 식별자**입니다. Post-Booking에서 MCP 서버가 생성하는 `transactionId`와는 별개입니다.
- 현재 제공되는 예제 프론트엔드는 상호작용을 `action` 메시지로 보냅니다. 새 클라이언트를 만들 때도 이 방식을 권장합니다.
- `assistant_message.metadata`에는 `sessionId`, `orderId`, `transactionId`, `refundQuoteId` 같은 후속 호출용 식별자가 포함될 수 있으므로, **대화 세션별로 보존**해야 합니다.
- `assistant_message.toolResult`는 MCP 서버의 `structuredContent` 원본이며, 커스텀 UI나 디버깅에 활용할 수 있습니다.

---

## 빠른 시작

### 사전 준비

- **Node.js** >= 18
- **PolarHub MCP Server** Endpoint 및 인증정보
- **LLM API 키** (아래 중 택 1)
  - OpenAI API Key (`sk-...`)
  - Google Gemini API Key
  - Bedrock API Key (`BEDROCK_API_KEY`, Bearer Token 방식)

### 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경 설정
cp .env.example .env
```

`.env` 파일을 편집합니다:

```bash
# LLM 제공자 (openai / gemini / bedrock 중 택 1)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key-here

# MCP 서버 엔드포인트
MCP_SERVER_URL=https://mcp.sandbox.halo-platform.net/mcp

# PolarHub 인증 (필수 — 관리자에게 발급받으세요)
POLARHUB_TENANT_ID=your-tenant-id
POLARHUB_API_SECRET=your-base64-secret
```

```bash
# 3. 빌드
npm run build

# 4. 개발 모드 실행
npm run dev
```

브라우저에서 **http://localhost:3000** 접속

### 헬스체크

```bash
curl http://localhost:3000/health
# { "status": "ok", "mode": "development" }
```

> **주의**: `.env` 파일은 `.gitignore`에 포함되어 있어 커밋되지 않습니다. 절대 `.env` 파일을 Git에 푸시하지 마세요.

### OTA 통합 체크리스트

- 브라우저 또는 앱 세션마다 WebSocket 연결을 1개 유지하세요.
- `assistant_message.metadata`를 저장하고, 같은 대화 안의 다음 액션에 재사용하세요.
- 폼 완료 이벤트는 가급적 `action` 메시지로 보내세요.
- PolarHub 시크릿은 **브라우저에 두지 말고** 이 서버의 환경 변수로만 주입하세요.

---

## 환경 변수

### 필수

| 변수 | 설명 | 예시 |
|------|------|------|
| `LLM_PROVIDER` | LLM 제공자 | `openai`, `gemini`, `bedrock` |
| `MCP_SERVER_URL` | MCP 서버 엔드포인트 | `https://mcp.sandbox.halo-platform.net/mcp` |
| `POLARHUB_TENANT_ID` | 에이전시/테넌트 ID | (발급 필요) |
| `POLARHUB_API_SECRET` | API 시크릿 (Base64) | (발급 필요) |

### LLM 제공자별

| 변수 | 제공자 | 설명 |
|------|:------:|------|
| `OPENAI_API_KEY` | OpenAI | API 키 (`sk-...`) |
| `OPENAI_MODEL` | OpenAI | 모델명 (기본: `gpt-4-turbo-preview`) |
| `GEMINI_API_KEY` | Gemini | API 키 |
| `GEMINI_MODEL` | Gemini | 모델명 (`gemini-2.0-flash`, `gemini-3-flash-preview` 등) |
| `BEDROCK_API_KEY` | Bedrock | Bedrock Converse API용 Bearer 토큰 |
| `AWS_REGION` | Bedrock | AWS 리전 |
| `BEDROCK_MODEL` | Bedrock | 모델 ID |

> 참고: `.env.example`은 `GEMINI_MODEL=gemini-2.0-flash`를 예시로 제공하고, 환경 변수를 완전히 생략했을 때 코드의 runtime fallback은 `gemini-3-flash-preview`입니다.

### 선택

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `DEBUG_PROMPTS` | `false` | LLM 프롬프트 콘솔 출력 |

---

## HTTP 엔드포인트

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/mcp` | POST | MCP JSON-RPC 메시지 수신 |
| `/mcp` | GET | SSE 스트림 (서버→클라이언트 알림) |
| `/mcp` | DELETE | 세션 종료 |
| `/health` | GET | 헬스체크 |
| `/ping` | GET | 헬스체크 프로브 |

**세션 관리:**
- 서버가 `Mcp-Session-Id` 응답 헤더로 세션 ID 발급
- 클라이언트는 후속 요청에 `Mcp-Session-Id` 헤더를 포함
- 세션별 독립 transport (stateful)

---

## MCP Server 인증 방식

MCP Server에 정적 헤더로 인증 정보를 전달합니다. 환경 변수로 설정된 값이 자동으로 헤더에 포함됩니다.

```text
X-PolarHub-Tenant-ID: {tenantId}
X-PolarHub-API-Secret: {base64_secret}
```

---

## MCP Tools (15개)

### Prime Booking Tools (6개)

항공편 검색 → 가격 확인 → 예약 생성 워크플로우.

| Tool | API | 설명 |
|------|-----|------|
| `flight_search` | AirShopping | 항공편 검색. `sessionId` 자동 생성, offers를 세션에 저장 |
| `flight_price` | OfferPrice | 오퍼 가격 확정. `sessionId` + `offerIndex`로 호출 |
| `select_seat` | SeatAvailability + OfferPrice | 좌석 선택. 항공사별 DIRECT/REPRICE/POSTBOOK 자동 분기 |
| `select_service` | ServiceList + OfferPrice | 부가서비스 선택. 항공사별 REPRICE/POSTBOOK 자동 분기 |
| `flight_book` | OrderCreate | 예약 생성 (PNR 발급). `sessionId` + 승객 정보 |
| `passenger_form` | — | 승객 입력 폼 반환 (API 호출 없음) |

**기본 흐름:**
```
flight_search → flight_price → flight_book
```

**좌석 + 서비스 선택 시 (Service-First 순서 필수):**
```
flight_search → flight_price → select_service → select_seat → flight_book
```

> **좌석+서비스 동시 선택 시 Service-First 순서 필수** — `select_service`가 `select_seat`보다 먼저 실행되어야 합니다.

### Post-Booking Tools (9개)

예약 조회 → 변경/취소 워크플로우.

| Tool | API | 설명 |
|------|-----|------|
| `order_retrieve` | OrderRetrieve | 예약 조회 (PNR, 상태, 승객, 티켓) |
| `service_list` | ServiceList | 부가서비스 목록 조회 |
| `seat_availability` | SeatAvailability | 좌석 배치도 조회 |
| `order_reshop` | OrderReshop | 일정 변경/환불 옵션 조회 |
| `order_quote` | OrderQuote | 변경 견적 조회 |
| `order_prepare` | OrderChange (step1) | 변경 준비 — 가격 확인까지 |
| `order_confirm` | OrderChange (step2) | 변경 확정 — 결제 실행 |
| `order_change` | OrderChange | 1-step 변경 (하위 호환) |
| `order_cancel` | OrderCancel | 예약 취소/환불 |

**2-Phase 워크플로우 (order_prepare → order_confirm):**
```
좌석 변경:    order_retrieve → seat_availability → order_prepare → (사용자 확인) → order_confirm
서비스 추가:  order_retrieve → service_list      → order_prepare → (사용자 확인) → order_confirm
일정 변경:    order_retrieve → order_reshop      → order_prepare → (사용자 확인) → order_confirm
발권:         order_retrieve → order_prepare(delayTicketing) → (사용자 확인) → order_confirm
PNR 분리:     order_retrieve → order_prepare(pnrSplit) → 완료
승객 변경:    order_retrieve → order_prepare(paxMod) → 완료
```

---

## MCP Resources (4개)

URI 기반 데이터 조회. Tool과 달리 파라미터 없이 URI만으로 접근합니다.

| Resource URI | 데이터 소스 | 설명 |
|--------------|-------------|------|
| `polarhub://carrier/{code}` | YAML (정적) | 항공사 지원 기능 매트릭스 (BA, SQ 등) |
| `polarhub://offer/{offerId}` | Redis 캐시 | flight_search 후 캐시된 오퍼 상세 (TTL 30분) |
| `polarhub://order/{orderId}` | OrderRetrieve API | 주문 상세 (PNR, 티켓, 가능한 액션) |
| `polarhub://seatmap/{offerId}` | SeatAvailability API | 좌석 배치도 |

---

## 온보딩 및 인증 정보

이 클라이언트를 실행하려면 PolarHub NDC 플랫폼 계정이 필요합니다.

### 접근 권한 받기

**contact@halosync.kr** 로 회사명과 사용 목적을 포함하여 온보딩 요청 메일을 보내주세요. Sandbox 인증 정보를 발급해드립니다.

> 자동화된 셀프 서비스 온보딩은 현재 준비 중입니다.

### 필요한 인증 정보

| 필요 정보 | 설명 | 발급 방법 |
|----------|------|----------|
| `POLARHUB_TENANT_ID` | 에이전시 식별자 | 온보딩 후 발급 |
| `POLARHUB_API_SECRET` | API 시크릿 (Base64) | 온보딩 후 발급 |

> Sandbox 환경은 테스트용이며, 실제 항공편 예약이 이루어지지 않습니다.
>
> [HaloSync](https://halosync.kr/) &nbsp;|&nbsp; [API 문서](https://doc.halo-platform.net/)

---

## 프로젝트 구조

```
polarhub-mcp-client/
├── src/                          # Bridge 서버 (Node.js + TypeScript)
│   ├── index.ts                  # 진입점 — 서버 시작, MCP 연결 (재시도 5회)
│   ├── config/                   # 환경변수 파싱 + 검증
│   ├── llm/                      # LLM 제공자 추상화
│   │   ├── provider.ts           # 공통 인터페이스 + 동적 프롬프트 빌더
│   │   ├── openai.ts             # OpenAI (Function Calling)
│   │   ├── gemini.ts             # Google Gemini (스키마 정제 로직 포함)
│   │   └── bedrock.ts            # AWS Bedrock (Bearer Token, HTTP 직접 호출)
│   ├── mcp/
│   │   └── client.ts             # MCP 클라이언트 — Streamable HTTP + 정적 헤더 인증 + 재연결
│   ├── orchestrator/
│   │   └── index.ts              # 핵심 엔진 — 의도 파싱 → Tool 호출 → 결과 요약 → 상태 관리
│   ├── server/
│   │   ├── http-server.ts        # Express (정적파일) + Vite (HMR, 개발용)
│   │   └── websocket.ts          # WebSocket 세션 관리 + 메타데이터 전파
│   └── shared/
│       └── types/messages.ts     # Client↔Server 메시지 타입 정의
├── packages/
│   ├── frontend/                 # React 웹앱
│   │   └── src/
│   │       ├── components/
│   │       │   ├── chat/         # ChatContainer, ChatInput, ChatMessage
│   │       │   └── layout/       # Header, Sidebar, MainLayout
│   │       └── store/            # Zustand 상태 관리
│   │           ├── chatStore.ts          # WebSocket 연결 + 메시지 상태
│   │           └── conversationStore.ts  # 대화 이력 (localStorage 영속화)
├── package.json                  # npm workspaces 루트
├── tsconfig.json
├── .env.example                  # 환경변수 템플릿 (더미값)
└── .gitignore                    # .env 포함 — 시크릿 커밋 방지
```

### 빌드 순서

```
frontend (React 앱)
    ↓
src/ (백엔드 TypeScript 컴파일)
```

`npm run build`가 이 순서를 자동으로 처리합니다.

---

## 기술 스택

| 계층 | 기술 |
|------|------|
| **Frontend** | React 18, Vite, Tailwind CSS, Zustand |
| **Backend** | Node.js, Express, TypeScript |
| **WebSocket** | ws (실시간 양방향 통신) |
| **MCP Client** | @modelcontextprotocol/sdk (Streamable HTTP) |
| **LLM** | OpenAI GPT-4 / Google Gemini / AWS Bedrock |
| **스타일** | Halo Design System (halo-purple, halo-green 토큰) |

---

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 모드 (tsx watch + Vite HMR) |
| `npm run build` | 전체 빌드 (frontend → bridge) |
| `npm start` | 프로덕션 모드 |
| `npm run clean` | 빌드 산출물 정리 |

---

## 다국어 지원 (i18n)

클라이언트는 **한국어**와 **영어**를 지원합니다. 브라우저 언어를 자동 감지하여 UI와 LLM 응답 언어가 전환됩니다.

### 동작 방식

1. 브라우저 언어(`navigator.language`)를 페이지 로드 시 감지
2. WebSocket을 통해 서버에 locale 전달
3. 시스템 프롬프트와 LLM 응답이 감지된 언어에 맞게 적용

### 영어로 전환하기

**방법 A — 브라우저 언어**: Chrome → 설정 → 언어 → English를 최상위로 이동

**방법 B — URL 파라미터**: URL에 `?locale=en` 추가:
```
http://localhost:3000/?locale=en
```

**방법 C — 환경 변수**: `.env`에서 서버 기본값 설정:
```
DEFAULT_LOCALE=en
```

> 우선순위: URL 파라미터 > 브라우저 언어 > `DEFAULT_LOCALE` 환경 변수

---

## 디버깅

### LLM 프롬프트 확인

LLM에 전달되는 시스템 프롬프트를 확인하려면:

```bash
DEBUG_PROMPTS=true npm run dev
```

콘솔에 Intent Parser / Result Summarizer 프롬프트가 출력됩니다.

### MCP 서버 연결 확인

```bash
# MCP 서버 헬스체크
curl http://localhost:8000/health
# { "status": "ok", "transport": "streamable-http" }

# 이 클라이언트 헬스체크
curl http://localhost:3000/health
# { "status": "ok", "mode": "development" }
```

### 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `MCP connection failed` 반복 | MCP 서버 미실행 또는 URL 오류 | `MCP_SERVER_URL` 확인, MCP 서버 상태 점검 |
| `LLM API key missing` | 환경변수 미설정 | `.env`에 선택한 `LLM_PROVIDER`에 맞는 API 키 설정 |
| `Authentication failed` | 인증 정보 오류 | `POLARHUB_TENANT_ID`, `POLARHUB_API_SECRET` 확인 |
| WebSocket 연결 끊김 | 서버 재시작 또는 네트워크 문제 | 브라우저 새로고침 (자동 재연결 시도) |

---

## 데모 영상

### Prime Booking — 항공편 검색 → 예약 완료 (SQ)

자연어로 항공편을 검색하고, 오퍼를 선택하고, 승객 정보를 입력하여 예약을 완료하는 전체 흐름입니다.


https://github.com/user-attachments/assets/7d728771-a0de-47d8-a812-5aee780338a0


### Post-Booking — 예약 조회 → 좌석 변경 (EK)

기존 예약을 조회하고, 좌석 배치도를 확인한 뒤, 좌석을 변경하고 재확인하는 흐름입니다.


https://github.com/user-attachments/assets/62dff77e-a183-4f86-ac72-f797f2df05b9


> 영상은 실제 데모를 3배속으로 편집한 것입니다.

---

## 사용 예시

### 항공편 검색 + 예약

```
사용자: 서울에서 싱가포르 4월 15일 성인 1명 항공편 검색해줘
→ AI가 검색 결과를 요약하여 항공편 목록 표시

사용자: 2번째 오퍼 선택
→ AI가 선택한 오퍼의 요금 상세 안내

사용자: 좌석도 선택하고 싶어
→ AI가 좌석 배치도 정보 안내

사용자: 12A 좌석으로
→ AI가 승객 정보 입력 요청

사용자: (승객 정보 제출)
→ AI가 예약 완료 확인 (PNR ABC123)
```

### 예약 관리

```
사용자: 주문 ORD_12345 조회해줘
→ AI가 예약 상태, 여정, 승객 정보를 요약하여 안내

사용자: 좌석을 15C로 변경하고 싶어
→ AI가 좌석 배치도 안내 → 가격 확인 → 변경 완료

사용자: 이 예약 환불하려면 얼마야?
→ AI가 환불 금액 안내

사용자: 환불 진행해줘
→ AI가 환불 완료 확인
```

---

## 지원 항공사

MCP 서버가 Sandbox 환경 PolarHub NDC API를 통해 아래 항공사들을 지원합니다.

주요 검증 완료 항공사:

| 항공사 | 코드 | Prime Booking | Post-Booking |
|--------|:----:|:---:|:---:|
| Singapore Airlines | SQ | O | O |
| Finnair | AY | O | O |
| Air France | AF | O | O |
| KLM | KL | O | O |
| Emirates | EK | O | O |
| Lufthansa | LH | O | - |
| Turkish Airlines | TK | O | O |
| Scoot | TR | O | O |
| Hawaiian Airlines | HA | O | O |
| Qatar Airways | QR | O | - |
| British Airways | BA | O | - |

---

## 라이선스

MIT License — [LICENSE](./LICENSE) 참조

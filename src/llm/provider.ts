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
import type { Locale } from '../i18n/types.js';
import type { AgentLoopAdapter } from './agentLoopAdapter.js';
import {
  getWorkflowRules, getParameterMapping, getResponseFormat,
  getToolGuidelines, getSummarizerIntro, getSummarizerCommonRules,
  getSummarizerCautions, getSummarizerClosing, getGeneralResponseClosing,
} from '../i18n/prompts/index.js';

/**
 * Conversation context for LLM
 * All booking state is managed by MCP server
 */
export interface ConversationContext {
  history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  locale?: Locale;
  // MCP session ID (if returned by tools) - Prime Booking
  mcpSessionId?: string;
  // Post-Booking Transaction ID
  postBookingTransactionId?: string;
  // Post-Booking Order ID
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

  /**
   * Optional — providers that support multi-turn agent loops return an adapter.
   * Gemini and Bedrock implement this; OpenAI does not yet.
   */
  createAgentLoopAdapter?(): AgentLoopAdapter;
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
export function buildIntentParserPrompt(tools: MCPTool[], locale: Locale = 'en'): string {
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

${getWorkflowRules(locale)}

## General Rules

- Use the tool's inputSchema to determine required vs optional parameters
- NEVER generate or fabricate IDs - only use IDs that the server returns
- **CRITICAL: If a sessionId is provided in the message (e.g., [Current sessionId: sess_xxx]), you MUST use that exact sessionId**
- Do not make up fake sessionIds like "sess_0123456789abcdef" - always use the real one from context
- **CRITICAL: When calling seat_availability or service_list in Prime Booking, only pass sessionId. Do NOT fill in the offer object!** The server auto-injects offerId, responseId, owner, offerItems from the session. Filling them in risks hallucinated IDs that cause API failures.
- Convert city names to IATA airport codes (e.g., Seoul → ICN, Tokyo → NRT)
- Convert relative dates to YYYY-MM-DD format
- transactionId is auto-injected by the system. Do NOT include transactionId in params.
- orderId must be the exact value from the order_retrieve result. Never fabricate it.

${getParameterMapping(locale)}

## Response Format

${getResponseFormat(locale)}

Today's date: ${today}`;
}

/**
 * Get minimal tool-specific guidelines
 * These are kept minimal as most guidance is now in tool descriptions
 */
function getToolSpecificGuidelinesForLocale(toolName: string, locale: Locale = 'en'): string {
  return getToolGuidelines(locale, toolName);
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

export function buildResultSummarizerPrompt(toolName: string, result: unknown, locale: Locale = 'en'): string {
  const resultStr = JSON.stringify(result, null, 2);
  const MAX_RESULT_LENGTH = 8000;
  const truncated = resultStr.length > MAX_RESULT_LENGTH
    ? smartTruncateJson(resultStr, MAX_RESULT_LENGTH)
    : resultStr;

  const toolGuidelinesText = getToolSpecificGuidelinesForLocale(toolName, locale);

  return `${getSummarizerIntro(locale)}

## Tool Result
Tool: ${toolName}
\`\`\`json
${truncated}
\`\`\`

${toolGuidelinesText}

${getSummarizerCommonRules(locale)}

${getSummarizerCautions(locale)}

${getSummarizerClosing(locale)}`;
}

export function buildGeneralResponsePrompt(context: ConversationContext, tools: MCPTool[]): string {
  const locale = context.locale ?? 'en';
  const toolList = tools.map(t => `- ${t.name}: ${t.description.split('\n')[0]}`).join('\n');
  const historyStr = context.history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n');

  return `You are a friendly MCP assistant.

Available tools:
${toolList}

Recent conversation:
${historyStr}

${getGeneralResponseClosing(locale)}`;
}

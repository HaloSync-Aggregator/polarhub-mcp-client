/**
 * OpenAI LLM Provider Implementation
 *
 * v3: Dynamic Tool Discovery
 */

import OpenAI from 'openai';
import type { LLMProvider, ConversationContext, IntentResult } from './provider.js';
import type { MCPTool } from '../mcp/client.js';
import {
  buildIntentParserPrompt,
  buildResultSummarizerPrompt,
  buildGeneralResponsePrompt,
} from './provider.js';
import { config } from '../config/index.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.llm.openai.apiKey,
    });
    this.model = config.llm.openai.model;
  }

  async parseIntent(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[]
  ): Promise<IntentResult> {
    // v3: Dynamic prompt generation from MCP tools
    const systemPrompt = buildIntentParserPrompt(availableTools);

    // v4: Debug logging for prompt inspection
    if (process.env.DEBUG_PROMPTS === 'true') {
      console.log('\n=== INTENT PARSER PROMPT (OpenAI) ===');
      console.log(systemPrompt);
      console.log('=== END PROMPT ===\n');
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...context.history.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // Build Function Calling tools from MCP tools
    const tools: OpenAI.Chat.ChatCompletionTool[] = availableTools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as OpenAI.FunctionParameters,
      },
    }));

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('Empty response from OpenAI');
      }

      // Case 1: Function call - LLM selected a tool
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const params = JSON.parse(toolCall.function.arguments);
        return {
          tool: toolCall.function.name,
          params,
          confidence: 1.0,
        };
      }

      // Case 2: Text response - no tool needed
      if (message.content) {
        // Try to parse as JSON for backward compatibility
        try {
          const parsed = JSON.parse(message.content) as IntentResult;
          return parsed;
        } catch {
          // Plain text response
          return {
            response: message.content,
            confidence: 0.8,
          };
        }
      }

      throw new Error('No content or tool_calls in response');
    } catch (error) {
      console.error('OpenAI parseIntent error:', error);
      return {
        response: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
        confidence: 0,
      };
    }
  }

  async summarizeResult(
    toolName: string,
    result: unknown,
    _context: ConversationContext
  ): Promise<string> {
    // v3: Dynamic prompt generation with tool-specific guidelines
    const systemPrompt = buildResultSummarizerPrompt(toolName, result);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: '위 결과를 사용자에게 친절하고 자세하게 요약해주세요. 가이드라인을 따라 핵심 정보를 모두 포함해주세요.'
          },
        ],
        temperature: 0.4,
        max_tokens: 4096, // Increased to handle detailed flight listings (12+ flights)
      });

      return response.choices[0]?.message?.content ?? '결과를 요약할 수 없습니다.';
    } catch (error) {
      console.error('OpenAI summarizeResult error:', error);
      return '결과를 요약하는 중 오류가 발생했습니다.';
    }
  }

  async generateResponse(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[] = []
  ): Promise<string> {
    // v3: Dynamic prompt generation with available tools
    const systemPrompt = buildGeneralResponsePrompt(context, availableTools);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...context.history.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0]?.message?.content ?? '응답을 생성할 수 없습니다.';
    } catch (error) {
      console.error('OpenAI generateResponse error:', error);
      return '응답을 생성하는 중 오류가 발생했습니다.';
    }
  }
}

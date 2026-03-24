/**
 * AWS Bedrock LLM Provider Implementation
 *
 * Uses Converse API with Bearer Token (API Key) authentication.
 * Direct HTTP calls — AWS SDK does not support Bearer token auth natively.
 */

import type { LLMProvider, ConversationContext, IntentResult } from './provider.js';
import type { MCPTool } from '../mcp/client.js';
import {
  buildIntentParserPrompt,
  buildResultSummarizerPrompt,
  buildGeneralResponsePrompt,
} from './provider.js';
import { config } from '../config/index.js';
import { t } from '../i18n/strings.js';

interface ConverseMessage {
  role: 'user' | 'assistant';
  content: Array<{ text: string } | { toolUse: { toolUseId: string; name: string; input: unknown } } | { toolResult: { toolUseId: string; content: Array<{ text: string }> } }>;
}

interface ConverseRequest {
  modelId: string;
  system?: Array<{ text: string }>;
  messages: ConverseMessage[];
  toolConfig?: { tools: Array<{ toolSpec: { name: string; description: string; inputSchema: { json: unknown } } }> };
  inferenceConfig?: { temperature?: number; maxTokens?: number };
}

export class BedrockProvider implements LLMProvider {
  private apiKey: string;
  private region: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.llm.bedrock.apiKey;
    this.region = config.llm.bedrock.region;
    this.model = config.llm.bedrock.model;
    this.baseUrl = `https://bedrock-runtime.${this.region}.amazonaws.com`;
  }

  private async converse(request: ConverseRequest): Promise<any> {
    const url = `${this.baseUrl}/model/${encodeURIComponent(request.modelId)}/converse`;
    const body: Record<string, unknown> = {
      messages: request.messages,
    };
    if (request.system) body.system = request.system;
    if (request.toolConfig) body.toolConfig = request.toolConfig;
    if (request.inferenceConfig) body.inferenceConfig = request.inferenceConfig;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  async parseIntent(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[]
  ): Promise<IntentResult> {
    const systemPrompt = buildIntentParserPrompt(availableTools, context.locale);

    if (process.env.DEBUG_PROMPTS === 'true') {
      console.log('\n=== INTENT PARSER PROMPT (Bedrock) ===');
      console.log(systemPrompt);
      console.log('=== END PROMPT ===\n');
    }

    const messages: ConverseMessage[] = context.history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: [{ text: m.content }],
    }));
    messages.push({ role: 'user', content: [{ text: userMessage }] });

    // Build Converse API tools from MCP tools
    const tools = availableTools.map(t => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: t.inputSchema },
      },
    }));

    try {
      const response = await this.converse({
        modelId: this.model,
        system: [{ text: systemPrompt }],
        messages,
        toolConfig: tools.length > 0 ? { tools } : undefined,
        inferenceConfig: { temperature: 0.3, maxTokens: 4096 },
      });

      const content = response.output?.message?.content ?? [];

      // Check for tool use
      const toolBlock = content.find((b: any) => b.toolUse);
      if (toolBlock?.toolUse) {
        return {
          tool: toolBlock.toolUse.name,
          params: toolBlock.toolUse.input as Record<string, unknown>,
          confidence: 1.0,
        };
      }

      // Text response
      const textBlock = content.find((b: any) => b.text);
      if (textBlock?.text) {
        return {
          response: textBlock.text,
          confidence: 0.8,
        };
      }

      throw new Error('No content or toolUse in Bedrock response');
    } catch (error) {
      console.error('Bedrock parseIntent error:', error);
      return {
        response: t(context.locale ?? 'en', 'errors.parseIntentFailed'),
        confidence: 0,
      };
    }
  }

  async summarizeResult(
    toolName: string,
    result: unknown,
    context: ConversationContext
  ): Promise<string> {
    const systemPrompt = buildResultSummarizerPrompt(toolName, result, context.locale);

    try {
      const response = await this.converse({
        modelId: this.model,
        system: [{ text: systemPrompt }],
        messages: [{
          role: 'user',
          content: [{ text: t(context.locale ?? 'en', 'ui.summarizerInstruction') }],
        }],
        inferenceConfig: { temperature: 0.4, maxTokens: 4096 },
      });

      const content = response.output?.message?.content ?? [];
      const textBlock = content.find((b: any) => b.text);
      return textBlock?.text ?? t(context.locale ?? 'en', 'errors.summarizeFailed');
    } catch (error) {
      console.error('Bedrock summarizeResult error:', error);
      return t(context.locale ?? 'en', 'errors.summarizeError');
    }
  }

  async generateResponse(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[] = []
  ): Promise<string> {
    const systemPrompt = buildGeneralResponsePrompt(context, availableTools);

    const messages: ConverseMessage[] = context.history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: [{ text: m.content }],
    }));
    messages.push({ role: 'user', content: [{ text: userMessage }] });

    try {
      const response = await this.converse({
        modelId: this.model,
        system: [{ text: systemPrompt }],
        messages,
        inferenceConfig: { temperature: 0.7, maxTokens: 500 },
      });

      const content = response.output?.message?.content ?? [];
      const textBlock = content.find((b: any) => b.text);
      return textBlock?.text ?? t(context.locale ?? 'en', 'errors.generateFailed');
    } catch (error) {
      console.error('Bedrock generateResponse error:', error);
      return t(context.locale ?? 'en', 'errors.generateError');
    }
  }
}

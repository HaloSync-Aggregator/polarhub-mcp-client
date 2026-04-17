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
import type { AgentLoopAdapter } from './agentLoopAdapter.js';
import { BedrockChatStepAdapter } from './bedrockAdapter.js';

export type ConverseContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: unknown } }
  | { toolResult: { toolUseId: string; content: Array<{ text: string }>; status?: 'success' | 'error' } };

export interface ConverseMessage {
  role: 'user' | 'assistant';
  content: ConverseContentBlock[];
}

export interface ConverseToolSpec {
  toolSpec: { name: string; description: string; inputSchema: { json: unknown } };
}

interface ConverseRequest {
  modelId: string;
  system?: Array<{ text: string }>;
  messages: ConverseMessage[];
  toolConfig?: { tools: ConverseToolSpec[] };
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

  /**
   * Low-level single-turn Converse call for the agent loop.
   * Caller owns the messages[] and system prompt. Returns the raw content blocks
   * plus extracted functionCall (if any) or text.
   */
  async chatStep(params: {
    messages: ConverseMessage[];
    system?: Array<{ text: string }>;
    tools: MCPTool[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    functionCall?: { name: string; args: Record<string, unknown> };
    text?: string;
    raw: ConverseContentBlock[];
    stopReason?: string;
  }> {
    const toolSpecs: ConverseToolSpec[] = params.tools.map(t => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: t.inputSchema },
      },
    }));

    const response = await this.converse({
      modelId: this.model,
      system: params.system,
      messages: params.messages,
      toolConfig: toolSpecs.length > 0 ? { tools: toolSpecs } : undefined,
      inferenceConfig: {
        temperature: params.temperature ?? 0.3,
        maxTokens: params.maxTokens ?? 4096,
      },
    });

    const raw = (response.output?.message?.content ?? []) as ConverseContentBlock[];
    const stopReason = response.stopReason as string | undefined;

    const toolBlock = raw.find(
      (b): b is { toolUse: { toolUseId: string; name: string; input: unknown } } =>
        typeof b === 'object' && b !== null && 'toolUse' in b,
    );
    if (toolBlock) {
      return {
        functionCall: {
          name: toolBlock.toolUse.name,
          args: toolBlock.toolUse.input as Record<string, unknown>,
        },
        raw,
        stopReason,
      };
    }

    const textBlock = raw.find(
      (b): b is { text: string } =>
        typeof b === 'object' && b !== null && 'text' in b,
    );
    return {
      text: textBlock?.text,
      raw,
      stopReason,
    };
  }

  createAgentLoopAdapter(): AgentLoopAdapter {
    return new BedrockChatStepAdapter(this);
  }
}

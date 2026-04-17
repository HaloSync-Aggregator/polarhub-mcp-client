/**
 * Google Gemini LLM Provider Implementation
 *
 * v3: Dynamic Tool Discovery
 */

import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import type { LLMProvider, ConversationContext, IntentResult } from './provider.js';
import type { MCPTool } from '../mcp/client.js';
import {
  buildIntentParserPrompt,
  buildResultSummarizerPrompt,
  buildGeneralResponsePrompt,
} from './provider.js';
import { config } from '../config/index.js';
import { t } from '../i18n/strings.js';

/**
 * Recursively strip JSON Schema keys unsupported by Gemini API.
 * Gemini rejects: additionalProperties, $schema, exclusiveMinimum, exclusiveMaximum
 */
function stripUnsupportedSchemaKeys(schema: Record<string, unknown>): Record<string, unknown> {
  const unsupportedKeys = new Set([
    '$schema', 'additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum',
  ]);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (unsupportedKeys.has(key)) continue;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripUnsupportedSchemaKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUnsupportedSchemaKeys(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.llm.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.llm.gemini.model,
    });
  }

  private toFunctionDeclarations(tools: MCPTool[]) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: stripUnsupportedSchemaKeys(tool.inputSchema as Record<string, unknown>) as any,
    }));
  }

  /**
   * Single-turn Gemini call for agent loop.
   * Manages the full Content[] history externally; returns either a functionCall or text.
   *
   * Returns the raw model Content so callers can preserve fields like `thoughtSignature`
   * (required by Gemini thinking models when echoing functionCall parts back).
   *
   * @param extraHint - Optional session context (key facts) appended to systemInstruction
   */
  async chatStep(
    contents: Content[],
    tools: MCPTool[],
    locale?: string,
    extraHint?: string | null
  ): Promise<{
    functionCall?: { name: string; args: Record<string, unknown> };
    text?: string;
    modelContent?: Content;
  }> {
    const functionDeclarations = this.toFunctionDeclarations(tools);
    const baseSystem = buildIntentParserPrompt(tools, (locale ?? 'en') as any);
    const agentLoopPreamble = `## Agent Loop Mode (CRITICAL — read this first)

You are running in multi-step agent loop mode. You can — and SHOULD — call tools multiple times in sequence to fully satisfy the user's request.

**After you receive a functionResponse, decide:**
1. Does the user's request need MORE tool calls to be complete? → call the next tool immediately.
2. Have all necessary tools been called AND do you have enough data to answer? → reply with plain text.

**Rules:**
- Chain tools according to the "Workflow Sequence Rules" below (e.g., flight_search → flight_price → seat_availability → select_seat → flight_book).
- Never stop early with text like "now I'll call X" — just call X via function calling.
- Only reply with plain text when the WHOLE request is complete, or when you need user clarification.
- Use IDs from prior tool results shown in [Session context] — never fabricate IDs.
- If a tool returned isError, decide: retry with corrected args, try a different tool, or explain the failure in plain text.

`;
    const composed = `${agentLoopPreamble}${baseSystem}`;
    const systemInstruction = extraHint ? `${composed}\n\n${extraHint}` : composed;

    const modelWithTools = this.genAI.getGenerativeModel({
      model: config.llm.gemini.model,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      systemInstruction,
    });

    const result = await modelWithTools.generateContent({
      contents,
      generationConfig: { temperature: 0.3 },
    });

    const response = result.response;
    // Grab the raw candidate content so all fields (thoughtSignature, etc.) survive
    const modelContent = (response.candidates?.[0]?.content ?? undefined) as Content | undefined;

    const functionCall = response.functionCalls()?.[0];
    if (functionCall) {
      return {
        functionCall: {
          name: functionCall.name,
          args: functionCall.args as Record<string, unknown>,
        },
        modelContent,
      };
    }

    return { text: response.text() || undefined, modelContent };
  }

  async parseIntent(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[]
  ): Promise<IntentResult> {
    // v3: Dynamic prompt generation from MCP tools
    const systemPrompt = buildIntentParserPrompt(availableTools, context.locale);

    // v4: Debug logging for prompt inspection
    if (process.env.DEBUG_PROMPTS === 'true') {
      console.log('\n=== INTENT PARSER PROMPT (Gemini) ===');
      console.log(systemPrompt);
      console.log('=== END PROMPT ===\n');
    }

    const history: Content[] = context.history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const functionDeclarations = this.toFunctionDeclarations(availableTools);

    try {
      // Create model with function calling support
      const modelWithTools = this.genAI.getGenerativeModel({
        model: config.llm.gemini.model,
        tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      });

      const chat = modelWithTools.startChat({
        history,
        generationConfig: {
          temperature: 0.3,
        },
      });

      const prompt = `${systemPrompt}\n\nUser message: ${userMessage}`;
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      // Check for function call
      const functionCall = response.functionCalls()?.[0];
      if (functionCall) {
        return {
          tool: functionCall.name,
          params: functionCall.args as Record<string, unknown>,
          confidence: 1.0,
        };
      }

      // Text response
      const responseText = response.text();
      if (responseText) {
        // Try JSON parse for backward compat
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as IntentResult;
            return parsed;
          }
        } catch {
          // Plain text
        }
        return {
          response: responseText,
          confidence: 0.8,
        };
      }

      throw new Error('No content or function call in Gemini response');
    } catch (error) {
      console.error('Gemini parseIntent error:', error);
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
    // v3: Dynamic prompt generation with tool-specific guidelines
    const systemPrompt = buildResultSummarizerPrompt(toolName, result, context.locale);

    try {
      const genResult = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${t(context.locale ?? 'en', 'ui.summarizerInstruction')}` }]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096, // Increased to handle detailed flight listings (12+ flights)
        },
      });

      return genResult.response.text() || t(context.locale ?? 'en', 'errors.summarizeFailed');
    } catch (error) {
      console.error('Gemini summarizeResult error:', error);
      return t(context.locale ?? 'en', 'errors.summarizeError');
    }
  }

  async generateResponse(
    userMessage: string,
    context: ConversationContext,
    availableTools: MCPTool[] = []
  ): Promise<string> {
    // v3: Dynamic prompt generation with available tools
    const systemPrompt = buildGeneralResponsePrompt(context, availableTools);

    const history: Content[] = context.history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    try {
      const chat = this.model.startChat({
        history,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      });

      const prompt = `${systemPrompt}\n\nUser: ${userMessage}`;
      const result = await chat.sendMessage(prompt);

      return result.response.text() || t(context.locale ?? 'en', 'errors.generateFailed');
    } catch (error) {
      console.error('Gemini generateResponse error:', error);
      return t(context.locale ?? 'en', 'errors.generateError');
    }
  }
}

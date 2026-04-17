/**
 * GeminiChatStepAdapter — AgentLoopAdapter implementation for Google Gemini.
 *
 * Wraps GeminiProvider.chatStep and manages GeminiSessionMemory so the
 * provider-agnostic AgentLoopRunner can drive multi-turn tool use.
 */

import type { Content } from '@google/generative-ai';
import type { MCPTool } from '../mcp/client.js';
import type {
  AgentLoopAdapter,
  ProviderMemory,
  ChatStepResult,
} from './agentLoopAdapter.js';
import type { GeminiProvider } from './gemini.js';
import { GeminiSessionMemory } from '../orchestrator/sessionMemory.js';

export class GeminiChatStepAdapter implements AgentLoopAdapter {
  constructor(private readonly provider: GeminiProvider) {}

  createMemory(opts?: { maxLength?: number }): ProviderMemory {
    return new GeminiSessionMemory(opts);
  }

  appendUserMessage(memory: ProviderMemory, text: string): void {
    (memory as GeminiSessionMemory).appendUserMessage(text);
  }

  async chatStep(
    memory: ProviderMemory,
    tools: MCPTool[],
    locale?: string,
  ): Promise<ChatStepResult> {
    const mem = memory as GeminiSessionMemory;
    const contents = mem.getContents();
    const hint = mem.getKeyFactsHint();

    const resp = await this.provider.chatStep(contents, tools, locale, hint);

    if (resp.functionCall) {
      return {
        functionCall: resp.functionCall,
        raw: resp.modelContent, // Content — preserves thoughtSignature
      };
    }
    return { text: resp.text, raw: resp.modelContent };
  }

  appendAssistantToolCall(
    memory: ProviderMemory,
    call: { name: string; args: Record<string, unknown> },
    raw?: unknown,
  ): void {
    const mem = memory as GeminiSessionMemory;
    if (raw) {
      mem.appendModelContent(raw as Content);
    } else {
      mem.appendFunctionCall(call.name, call.args);
    }
  }

  appendAssistantText(memory: ProviderMemory, text: string, raw?: unknown): void {
    const mem = memory as GeminiSessionMemory;
    if (raw) {
      mem.appendModelContent(raw as Content);
    } else {
      mem.appendModelText(text);
    }
  }

  appendToolResult(
    memory: ProviderMemory,
    name: string,
    resultText: string,
    isError: boolean,
  ): void {
    (memory as GeminiSessionMemory).appendFunctionResponse(name, resultText, isError);
  }
}

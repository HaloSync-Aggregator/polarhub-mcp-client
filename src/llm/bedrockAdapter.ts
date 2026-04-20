/**
 * BedrockChatStepAdapter — AgentLoopAdapter implementation for AWS Bedrock (Converse API).
 *
 * Wraps BedrockProvider.chatStep and manages BedrockSessionMemory so the
 * provider-agnostic AgentLoopRunner can drive multi-turn tool use.
 */

import type { MCPTool } from '../mcp/client.js';
import type {
  AgentLoopAdapter,
  ProviderMemory,
  ChatStepResult,
} from './agentLoopAdapter.js';
import type { BedrockProvider, ConverseContentBlock } from './bedrock.js';
import { BedrockSessionMemory } from '../orchestrator/bedrockSessionMemory.js';
import { buildIntentParserPrompt } from './provider.js';
import { AGENT_LOOP_PREAMBLE } from '../orchestrator/keyFacts.js';
import type { Locale } from '../i18n/types.js';

export class BedrockChatStepAdapter implements AgentLoopAdapter {
  constructor(private readonly provider: BedrockProvider) {}

  createMemory(opts?: { maxLength?: number }): ProviderMemory {
    return new BedrockSessionMemory(opts);
  }

  appendUserMessage(memory: ProviderMemory, text: string): void {
    (memory as BedrockSessionMemory).appendUserMessage(text);
  }

  async chatStep(
    memory: ProviderMemory,
    tools: MCPTool[],
    locale?: string,
  ): Promise<ChatStepResult> {
    const mem = memory as BedrockSessionMemory;
    const baseSystem = buildIntentParserPrompt(tools, (locale ?? 'en') as Locale);
    const hint = mem.getKeyFactsHint();
    const composed = `${AGENT_LOOP_PREAMBLE}${baseSystem}`;
    const systemText = hint ? `${composed}\n\n${hint}` : composed;

    const resp = await this.provider.chatStep({
      messages: mem.getMessages(),
      system: [{ text: systemText }],
      tools,
      temperature: 0.3,
    });

    if (resp.functionCall) {
      return { functionCall: resp.functionCall, raw: resp.raw };
    }
    return { text: resp.text, raw: resp.raw };
  }

  appendAssistantToolCall(
    memory: ProviderMemory,
    call: { name: string; args: Record<string, unknown> },
    raw?: unknown,
  ): void {
    (memory as BedrockSessionMemory).appendAssistantToolCall(
      call,
      raw as ConverseContentBlock[] | undefined,
    );
  }

  appendAssistantText(memory: ProviderMemory, text: string, raw?: unknown): void {
    (memory as BedrockSessionMemory).appendAssistantText(
      text,
      raw as ConverseContentBlock[] | undefined,
    );
  }

  appendToolResult(
    memory: ProviderMemory,
    name: string,
    resultText: string,
    isError: boolean,
  ): void {
    (memory as BedrockSessionMemory).appendToolResult(name, resultText, isError);
  }

  rollbackLastToolCall(memory: ProviderMemory): void {
    (memory as BedrockSessionMemory).rollbackLastToolCall();
  }
}

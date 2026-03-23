/**
 * LLM Provider Factory
 */

import type { LLMProvider } from './provider.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { BedrockProvider } from './bedrock.js';
import { config } from '../config/index.js';

export type { LLMProvider, ConversationContext, IntentResult } from './provider.js';

export function createLLMProvider(): LLMProvider {
  switch (config.llm.provider) {
    case 'openai':
      console.log('Using OpenAI provider');
      return new OpenAIProvider();
    case 'gemini':
      console.log('Using Gemini provider');
      return new GeminiProvider();
    case 'bedrock':
      console.log('Using Bedrock provider');
      return new BedrockProvider();
    default:
      console.log('Defaulting to OpenAI provider');
      return new OpenAIProvider();
  }
}

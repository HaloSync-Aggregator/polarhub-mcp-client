/**
 * Demo Server Configuration
 *
 * Streamable HTTP + PolarHub Auth Pass-through
 *
 * Demo 서버가 PolarHub 인증 정보를 MCP 서버에 정적 HTTP 헤더로 전달:
 * - X-PolarHub-Tenant-ID + X-PolarHub-API-Secret
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseLocale, type Locale } from '../i18n/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenvConfig({ path: resolve(__dirname, '../../.env') });

export interface Config {
  server: {
    port: number;
  };
  llm: {
    provider: 'openai' | 'gemini' | 'bedrock';
    openai: {
      apiKey: string;
      model: string;
    };
    gemini: {
      apiKey: string;
      model: string;
    };
    bedrock: {
      apiKey: string;
      region: string;
      model: string;
    };
  };
  mcp: {
    serverUrl: string;
  };
  polarhub: {
    tenantId: string;
    apiSecret: string;
  };
  locale: {
    default: Locale;
  };
}

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
  llm: {
    provider: (process.env.LLM_PROVIDER ?? 'openai') as 'openai' | 'gemini' | 'bedrock',
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4-turbo-preview',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
    },
    bedrock: {
      apiKey: process.env.BEDROCK_API_KEY ?? '',
      region: process.env.AWS_REGION ?? 'us-east-1',
      model: process.env.BEDROCK_MODEL ?? 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    },
  },
  mcp: {
    serverUrl: process.env.MCP_SERVER_URL ?? 'https://mcp.sandbox.halo-platform.net/mcp',
  },
  polarhub: {
    tenantId: process.env.POLARHUB_TENANT_ID ?? '',
    apiSecret: process.env.POLARHUB_API_SECRET ?? '',
  },
  locale: {
    default: parseLocale(process.env.DEFAULT_LOCALE, 'en'),
  },
};

export function validateConfig(): void {
  const provider = config.llm.provider;

  if (provider === 'openai' && !config.llm.openai.apiKey) {
    console.warn('Warning: OPENAI_API_KEY not set. OpenAI provider will not work.');
  }

  if (provider === 'gemini' && !config.llm.gemini.apiKey) {
    console.warn('Warning: GEMINI_API_KEY not set. Gemini provider will not work.');
  }

  if (provider === 'bedrock' && !config.llm.bedrock.apiKey) {
    console.warn('Warning: BEDROCK_API_KEY not set. Bedrock provider will not work.');
  }

  if (!config.mcp.serverUrl) {
    console.warn('Warning: MCP_SERVER_URL not set. MCP server connection will fail.');
  }
}

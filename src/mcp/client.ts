/**
 * MCP Client Manager
 *
 * Streamable HTTP + PolarHub Auth Pass-through
 *
 * PolarHub 인증 정보를 정적 HTTP 헤더로 MCP 서버에 전달:
 * - X-PolarHub-Tenant-ID + X-PolarHub-API-Secret
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { config } from '../config/index.js';

/**
 * MCP Tool Result - 범용 응답 구조
 * MCP 서버의 구체적인 응답 형식을 가정하지 않음
 */
export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Reconnection configuration
 */
interface ReconnectConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
};

export class MCPClientManager {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private connected = false;
  private tools: MCPTool[] = [];
  private resources: MCPResource[] = [];
  private reconnectConfig: ReconnectConfig;
  private reconnecting = false;

  constructor(reconnectConfig: ReconnectConfig = DEFAULT_RECONNECT_CONFIG) {
    this.reconnectConfig = reconnectConfig;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log('MCP client already connected');
      return;
    }

    console.log('Connecting to MCP server (Streamable HTTP)...');
    console.log('MCP server URL:', config.mcp.serverUrl);

    try {
      // Build static auth headers for PolarHub pass-through
      const headers: Record<string, string> = {};
      if (config.polarhub.tenantId) {
        headers['X-PolarHub-Tenant-ID'] = config.polarhub.tenantId;
      }
      if (config.polarhub.apiSecret) {
        headers['X-PolarHub-API-Secret'] = config.polarhub.apiSecret;
      }

      this.transport = new StreamableHTTPClientTransport(
        new URL(config.mcp.serverUrl),
        { requestInit: { headers } },
      );

      this.client = new Client({
        name: 'polarhub-demo',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await this.client.connect(this.transport);
      this.connected = true;

      // Fetch available tools and resources
      await this.refreshCapabilities();

      console.log('MCP client connected successfully');
      console.log('Available tools:', this.tools.map(t => t.name).join(', '));
      console.log('Available resources:', this.resources.map(r => r.uri).join(', '));
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      throw error;
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  async reconnect(): Promise<void> {
    if (this.reconnecting) {
      console.log('Reconnection already in progress');
      return;
    }

    this.reconnecting = true;
    let delay = this.reconnectConfig.initialDelayMs;

    for (let attempt = 1; attempt <= this.reconnectConfig.maxRetries; attempt++) {
      console.log(`Reconnection attempt ${attempt}/${this.reconnectConfig.maxRetries} (delay: ${delay}ms)`);

      try {
        // Clean up existing connection
        await this.disconnect();

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Attempt reconnection
        await this.connect();
        this.reconnecting = false;
        console.log('Reconnection successful');
        return;
      } catch (error) {
        console.error(`Reconnection attempt ${attempt} failed:`, error);

        // Exponential backoff
        delay = Math.min(delay * 2, this.reconnectConfig.maxDelayMs);
      }
    }

    this.reconnecting = false;
    throw new Error(`Failed to reconnect after ${this.reconnectConfig.maxRetries} attempts`);
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      this.client = null;
      this.transport = null;
      console.log('MCP client disconnected');
    } catch (error) {
      console.error('Error disconnecting MCP client:', error);
    }
  }

  private async refreshCapabilities(): Promise<void> {
    if (!this.client) return;

    try {
      // List tools
      const toolsResult = await this.client.listTools();
      this.tools = (toolsResult.tools ?? []).map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));

      // List resources (optional — Gateway may not support this)
      try {
        const resourcesResult = await this.client.listResources();
        this.resources = (resourcesResult.resources ?? []).map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        }));
      } catch {
        console.warn('resources/list not supported, skipping');
        this.resources = [];
      }
    } catch (error) {
      console.error('Error refreshing MCP capabilities:', error);
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<MCPToolResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }

    const startedAt = Date.now();
    console.log(`Calling MCP tool: ${name}`, JSON.stringify(args, null, 2));

    try {
      const result = await this.client.callTool(
        { name, arguments: args },
        undefined,
        options?.timeoutMs ? { timeout: options.timeoutMs } : undefined,
      );

      const elapsed = Date.now() - startedAt;
      console.log(`MCP tool ${name} completed in ${elapsed}ms; result keys:`, Object.keys(result));
      if ((result as any).structuredContent) {
        console.log(`MCP tool ${name} structuredContent keys:`, Object.keys((result as any).structuredContent));
      }

      return result as MCPToolResult;
    } catch (error) {
      const elapsed = Date.now() - startedAt;
      console.error(`Error calling MCP tool ${name} after ${elapsed}ms:`, error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; text?: string; mimeType?: string }> }> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client not connected');
    }

    console.log(`Reading MCP resource: ${uri}`);

    try {
      const result = await this.client.readResource({ uri });
      return result as { contents: Array<{ uri: string; text?: string; mimeType?: string }> };
    } catch (error) {
      console.error(`Error reading MCP resource ${uri}:`, error);
      throw error;
    }
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  getResources(): MCPResource[] {
    return this.resources;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getToolByName(name: string): MCPTool | undefined {
    return this.tools.find(t => t.name === name);
  }
}

// Singleton instance
export const mcpClient = new MCPClientManager();

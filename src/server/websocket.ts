/**
 * WebSocket Server
 *
 * v3: MCP 서버 완전 분리
 *
 * 변경 사항:
 * - sessionId 가정 제거 (범용 metadata 사용)
 * - Form-to-action 매핑 단순화 (LLM 경유)
 * - transactionId 레거시 지원 제거
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, type Server as HttpServer } from 'http';
import {
  generateMessageId,
  type ClientMessage,
  type ServerMessage,
} from '../shared/index.js';
import { orchestrator } from '../orchestrator/index.js';

interface ClientConnection {
  ws: WebSocket;
  sessionId: string; // WebSocket session ID
  mcpMetadata?: Record<string, unknown>; // MCP server metadata (from tool results)
}

export class WebSocketHandler {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();

  /**
   * Attach WebSocket to an existing HTTP server.
   * Uses noServer mode + /ws path filtering to coexist with Vite HMR WebSocket.
   */
  async attachToServer(httpServer: HttpServer): Promise<void> {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      if (request.url === '/ws') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // Other upgrade requests (e.g. Vite HMR /@vite/client) are handled by Vite
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    console.log('WebSocket handler attached to HTTP server');
  }

  /** @deprecated Use attachToServer() instead */
  async start(port: number): Promise<void> {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const sessionId = generateMessageId();
    const clientConnection: ClientConnection = {
      ws,
      sessionId,
    };

    this.clients.set(sessionId, clientConnection);
    console.log(`Client connected: ${sessionId}`);

    this.send(ws, {
      type: 'connection',
      status: 'connected',
      sessionId,
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await this.handleMessage(clientConnection, message);
      } catch (error) {
        console.error('Error handling message:', error);
        this.send(ws, {
          type: 'error',
          id: generateMessageId(),
          code: 'PARSE_ERROR',
          message: 'Failed to parse message',
        });
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${sessionId}`);
      this.clients.delete(sessionId);
      orchestrator.clearContext(sessionId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${sessionId}:`, error);
    });
  }

  private async handleMessage(
    client: ClientConnection,
    message: ClientMessage
  ): Promise<void> {
    const { ws } = client;

    switch (message.type) {
      case 'user_message':
        await this.handleUserMessage(client, message.content);
        break;

      case 'action':
        await this.handleAction(
          client,
          message.action,
          message.payload
        );
        break;

      case 'form_submit':
        await this.handleFormSubmit(
          client,
          message.formType,
          message.data
        );
        break;

      case 'ping':
        this.send(ws, {
          type: 'pong',
          timestamp: Date.now(),
        });
        break;

      default:
        this.send(ws, {
          type: 'error',
          id: generateMessageId(),
          code: 'UNKNOWN_MESSAGE',
          message: `Unknown message type`,
        });
    }
  }

  private async handleUserMessage(
    client: ClientConnection,
    content: string
  ): Promise<void> {
    const { ws, sessionId } = client;

    try {
      const toolCallId = generateMessageId();

      // Send tool_call_start before processing (so frontend can show loading state)
      // We don't know the tool name yet, but the id is generated for pairing with tool_call_end
      const result = await orchestrator.processMessage(sessionId, content);

      // v3: 범용 metadata 저장 (sessionId 등 포함)
      if (result.metadata) {
        client.mcpMetadata = { ...client.mcpMetadata, ...result.metadata };
      }

      if (result.toolCalled) {
        // Send tool_call_start retroactively so frontend creates the system message
        this.send(ws, {
          type: 'tool_call_start',
          id: toolCallId,
          toolName: result.toolCalled,
          timestamp: Date.now(),
        });

        this.send(ws, {
          type: 'tool_call_end',
          id: toolCallId,
          toolName: result.toolCalled,
          success: result.toolSuccess ?? false,
          timestamp: Date.now(),
        });
      }

      this.send(ws, {
        type: 'assistant_message',
        id: generateMessageId(),
        content: result.message,
        timestamp: Date.now(),
        ...(result.toolResult && { toolResult: result.toolResult }),
        ...(result.metadata && { metadata: result.metadata }),

      } as any);

    } catch (error) {
      console.error('Error processing user message:', error);
      this.send(ws, {
        type: 'error',
        id: generateMessageId(),
        code: 'PROCESSING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleAction(
    client: ClientConnection,
    action: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const { ws, sessionId, mcpMetadata } = client;

    try {
      const toolCallId = generateMessageId();

      // v3: 저장된 metadata를 payload에 병합 (없는 키만)
      const enrichedPayload = { ...mcpMetadata, ...payload };

      const result = await orchestrator.processAction(
        sessionId,
        action,
        enrichedPayload
      );

      if (result.metadata) {
        client.mcpMetadata = { ...client.mcpMetadata, ...result.metadata };
      }

      // Send tool_call_start + end for QA structural verification
      if (result.toolCalled) {
        this.send(ws, {
          type: 'tool_call_start',
          id: toolCallId,
          toolName: result.toolCalled,
          timestamp: Date.now(),
        });

        this.send(ws, {
          type: 'tool_call_end',
          id: toolCallId,
          toolName: result.toolCalled,
          success: result.toolSuccess ?? false,
          timestamp: Date.now(),
        });
      }

      this.send(ws, {
        type: 'assistant_message',
        id: generateMessageId(),
        content: result.message,
        timestamp: Date.now(),
        ...(result.toolResult && { toolResult: result.toolResult }),
        ...(result.metadata && { metadata: result.metadata }),

      } as any);

    } catch (error) {
      console.error('Error processing action:', error);
      this.send(ws, {
        type: 'error',
        id: generateMessageId(),
        code: 'ACTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Form submit handler
   *
   * v3: Form type을 action으로 직접 전달
   * - 매핑 테이블 제거
   * - Orchestrator가 LLM을 통해 적절한 tool 선택
   */
  private async handleFormSubmit(
    client: ClientConnection,
    formType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    // v3: formType을 그대로 action으로 사용
    // Orchestrator의 ACTION_DESCRIPTIONS가 처리
    await this.handleAction(client, formType, data);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  async stop(): Promise<void> {
    if (this.wss) {
      for (const [, client] of this.clients) {
        client.ws.close();
      }
      this.clients.clear();

      return new Promise((resolve) => {
        this.wss!.close(() => {
          console.log('WebSocket server stopped');
          resolve();
        });
      });
    }
  }
}

export const wsHandler = new WebSocketHandler();

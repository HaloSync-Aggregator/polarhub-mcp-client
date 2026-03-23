/**
 * WebSocket Message Types for Client-Server Communication
 */

// ============================================
// Client → Server Messages
// ============================================

export interface UserMessagePayload {
  type: 'user_message';
  id: string;
  content: string;
  timestamp: number;
}

export interface ActionPayload {
  type: 'action';
  id: string;
  action: string;
  payload: Record<string, unknown>;
  transactionId: string;
}

export interface FormSubmitPayload {
  type: 'form_submit';
  id: string;
  formType: 'passenger' | 'payment' | 'search' | 'contact';
  data: Record<string, unknown>;
  transactionId: string;
}

export interface PingPayload {
  type: 'ping';
  timestamp: number;
}

export type ClientMessage =
  | UserMessagePayload
  | ActionPayload
  | FormSubmitPayload
  | PingPayload;

// ============================================
// Server → Client Messages
// ============================================

export interface AssistantMessagePayload {
  type: 'assistant_message';
  id: string;
  content: string;
  timestamp: number;
}

export interface StreamChunkPayload {
  type: 'stream_chunk';
  id: string;
  delta: string;
  done: boolean;
}

export interface ErrorPayload {
  type: 'error';
  id: string;
  code: string;
  message: string;
}

export interface PongPayload {
  type: 'pong';
  timestamp: number;
}

export interface ConnectionPayload {
  type: 'connection';
  status: 'connected' | 'disconnected' | 'reconnecting';
  sessionId?: string;
}

export interface ToolCallStartPayload {
  type: 'tool_call_start';
  id: string;
  toolName: string;
  timestamp: number;
}

export interface ToolCallEndPayload {
  type: 'tool_call_end';
  id: string;
  toolName: string;
  success: boolean;
  timestamp: number;
}

export type ServerMessage =
  | AssistantMessagePayload
  | StreamChunkPayload
  | ErrorPayload
  | PongPayload
  | ConnectionPayload
  | ToolCallStartPayload
  | ToolCallEndPayload;

// ============================================
// Conversation Types
// ============================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Tool result JSON data */
  toolResult?: Record<string, unknown>;
  toolCall?: {
    name: string;
    status: 'pending' | 'success' | 'error';
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  transactionId?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// Utility Types
// ============================================

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateTransactionId(): string {
  const bytes = new Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

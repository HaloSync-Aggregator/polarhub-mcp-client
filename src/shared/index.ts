/**
 * @polarhub-demo/shared
 * Shared types and utilities for PolarHub Demo
 */

// Message Types
export type {
  ClientMessage,
  ServerMessage,
  UserMessagePayload,
  ActionPayload,
  FormSubmitPayload,
  AssistantMessagePayload,
  StreamChunkPayload,
  ErrorPayload,
  ToolCallStartPayload,
  ToolCallEndPayload,
  ConversationMessage,
  Conversation,
} from './types/messages.js';

// Utilities
export {
  generateMessageId,
  generateTransactionId,
} from './types/messages.js';

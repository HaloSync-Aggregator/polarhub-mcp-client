/**
 * Chat Store - Zustand state management for chat
 */

import { create } from 'zustand';
import type {
  ConversationMessage,
  ServerMessage,
  ClientMessage,
} from '@polarhub-demo/shared';
import { generateMessageId, generateTransactionId } from '@polarhub-demo/shared';
import { useConversationStore } from './conversationStore';
import { getLocale, tf } from '../i18n';

// Extended assistant message payload with toolResult
interface AssistantMessageWithToolResult {
  type: 'assistant_message';
  id: string;
  content: string;
  timestamp: number;
  toolResult?: Record<string, unknown>;
}

interface ChatState {
  // Connection state
  connected: boolean;
  sessionId: string | null;

  // Messages
  messages: ConversationMessage[];

  // Transaction
  transactionId: string;

  // Current conversation ID (synced with conversationStore)
  currentConversationId: string | null;

  // Loading state
  isLoading: boolean;

  // WebSocket
  ws: WebSocket | null;

  // Actions
  connect: (url: string) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  sendAction: (action: string, payload: Record<string, unknown>) => void;
  addMessage: (message: ConversationMessage) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  newConversation: () => void;
  loadConversation: (conversationId: string) => void;
  saveCurrentConversation: () => void;
  deleteConversation: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  connected: false,
  sessionId: null,
  messages: [],
  transactionId: generateTransactionId(),
  currentConversationId: null,
  isLoading: false,
  ws: null,

  connect: (url: string) => {
    const ws = new WebSocket(`${url}?locale=${getLocale()}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage | AssistantMessageWithToolResult;
        handleServerMessage(message, set, get);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ connected: false, sessionId: null, ws: null });
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    set({ ws });
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, connected: false, sessionId: null });
    }
  },

  sendMessage: (content: string) => {
    const { ws, connected } = get();
    if (!ws || !connected) {
      console.error('Not connected');
      return;
    }

    const userMessage: ConversationMessage = {
      id: generateMessageId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Add user message immediately
    set((state) => {
      const newMessages = [...state.messages, userMessage];
      // Auto-save to conversation store
      if (state.currentConversationId) {
        setTimeout(() => {
          useConversationStore.getState().saveConversation(
            state.currentConversationId!,
            newMessages,
            state.transactionId
          );
        }, 0);
      }
      return {
        messages: newMessages,
        isLoading: true,
      };
    });

    // Send to server
    const payload: ClientMessage = {
      type: 'user_message',
      id: userMessage.id,
      content,
      timestamp: userMessage.timestamp,
    };

    ws.send(JSON.stringify(payload));
  },

  sendAction: (action: string, payload: Record<string, unknown>) => {
    const { ws, connected, transactionId: txnId } = get();
    if (!ws || !connected) {
      console.error('Not connected');
      return;
    }

    set({ isLoading: true });

    const message: ClientMessage = {
      type: 'action',
      id: generateMessageId(),
      action: action as any,
      payload,
      transactionId: txnId,
    };

    ws.send(JSON.stringify(message));
  },

  addMessage: (message: ConversationMessage) => {
    set((state) => {
      const newMessages = [...state.messages, message];
      // Auto-save to conversation store
      if (state.currentConversationId) {
        setTimeout(() => {
          useConversationStore.getState().saveConversation(
            state.currentConversationId!,
            newMessages,
            state.transactionId
          );
        }, 0);
      }
      return { messages: newMessages };
    });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  newConversation: () => {
    // Save current conversation before starting new one
    const { currentConversationId, messages, transactionId } = get();
    if (currentConversationId && messages.length > 0) {
      useConversationStore.getState().saveConversation(currentConversationId, messages, transactionId);
    }

    // Create new conversation
    const newId = useConversationStore.getState().createConversation();
    const newTransaction = generateTransactionId();

    set({
      messages: [],
      transactionId: newTransaction,
      currentConversationId: newId,
    });

    // Update the new conversation with transaction ID
    useConversationStore.getState().saveConversation(newId, [], newTransaction);
  },

  loadConversation: (conversationId: string) => {
    // Save current conversation first
    const { currentConversationId, messages, transactionId } = get();
    if (currentConversationId && messages.length > 0) {
      useConversationStore.getState().saveConversation(currentConversationId, messages, transactionId);
    }

    // Load the selected conversation
    const conversation = useConversationStore.getState().loadConversation(conversationId);
    if (conversation) {
      set({
        messages: conversation.messages,
        transactionId: conversation.transactionId,
        currentConversationId: conversationId,
      });
      useConversationStore.getState().setActiveConversation(conversationId);
    }
  },

  saveCurrentConversation: () => {
    const { currentConversationId, messages, transactionId } = get();
    if (currentConversationId) {
      useConversationStore.getState().saveConversation(currentConversationId, messages, transactionId);
    }
  },

  deleteConversation: (conversationId: string) => {
    const { currentConversationId } = get();
    const conversationStore = useConversationStore.getState();

    // Delete from conversation store
    conversationStore.deleteConversation(conversationId);

    // If deleting the active conversation, switch to another or create new
    if (currentConversationId === conversationId) {
      const remainingConversations = conversationStore.conversations;

      if (remainingConversations.length > 0) {
        // Load the first remaining conversation
        const nextConversation = remainingConversations[0];
        set({
          messages: nextConversation.messages,
          transactionId: nextConversation.transactionId,
          currentConversationId: nextConversation.id,
        });
        conversationStore.setActiveConversation(nextConversation.id);
      } else {
        // No conversations left, create a new one
        const newId = conversationStore.createConversation();
        const newTransaction = generateTransactionId();
        set({
          messages: [],
          transactionId: newTransaction,
          currentConversationId: newId,
        });
      }
    }
  },
}));

// Handle incoming server messages
function handleServerMessage(
  message: ServerMessage | AssistantMessageWithToolResult,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  _get: () => ChatState
) {
  void _get; // Reserved for future use
  switch (message.type) {
    case 'connection':
      set({
        connected: message.status === 'connected',
        sessionId: message.sessionId || null,
      });
      break;

    case 'assistant_message':
      const extendedMsg = message as AssistantMessageWithToolResult;
      const assistantMsg: ConversationMessage = {
        id: extendedMsg.id,
        role: 'assistant',
        content: extendedMsg.content,
        timestamp: extendedMsg.timestamp,
        toolResult: extendedMsg.toolResult,
      };
      set((state) => {
        const newMessages = [...state.messages, assistantMsg];
        // Auto-save to conversation store
        if (state.currentConversationId) {
          setTimeout(() => {
            useConversationStore.getState().saveConversation(
              state.currentConversationId!,
              newMessages,
              state.transactionId
            );
          }, 0);
        }
        return {
          messages: newMessages,
          isLoading: false,
        };
      });
      break;

    case 'tool_call_start':
      set((state) => {
        const messages = [...state.messages];
        // Add a system message for tool call
        messages.push({
          id: message.id,
          role: 'system',
          content: `${message.toolName} ${tf('chat.toolCalling')}`,
          timestamp: message.timestamp,
          toolCall: {
            name: message.toolName,
            status: 'pending',
          },
        });
        return { messages };
      });
      break;

    case 'tool_call_end':
      set((state) => {
        const messages = [...state.messages];
        // Update the tool call message
        const toolMsg = messages.find(m => m.id === message.id);
        if (toolMsg && toolMsg.toolCall) {
          toolMsg.toolCall.status = message.success ? 'success' : 'error';
        }
        return { messages };
      });
      break;

    case 'error':
      console.error('Server error:', message.message);
      const errorMsg: ConversationMessage = {
        id: message.id,
        role: 'system',
        content: `${tf('chat.error')}${message.message}`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        isLoading: false,
      }));
      break;

    case 'pong':
      // Heartbeat response, ignore
      break;
  }
}

/**
 * Conversation Store - Persist and manage chat sessions
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConversationMessage } from '@polarhub-demo/shared';
import { generateTransactionId } from '@polarhub-demo/shared';
import { tf } from '../i18n';

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  transactionId: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationState {
  // All saved conversations
  conversations: Conversation[];

  // Currently active conversation
  activeConversationId: string | null;

  // Sidebar state
  sidebarOpen: boolean;

  // Actions
  createConversation: () => string;
  loadConversation: (id: string) => Conversation | null;
  saveConversation: (id: string, messages: ConversationMessage[], transactionId: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  getActiveConversation: () => Conversation | null;
}

// Generate unique conversation ID
function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Generate title from first message
function generateTitle(messages: ConversationMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (firstUserMessage) {
    const content = firstUserMessage.content;
    // Truncate to 30 chars
    return content.length > 30 ? content.substring(0, 30) + '...' : content;
  }
  return tf('conversation.new');
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      sidebarOpen: true,

      createConversation: () => {
        const id = generateConversationId();
        const newConversation: Conversation = {
          id,
          title: tf('conversation.new'),
          messages: [],
          transactionId: generateTransactionId(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: id,
        }));

        return id;
      },

      loadConversation: (id: string) => {
        const { conversations } = get();
        return conversations.find(c => c.id === id) || null;
      },

      saveConversation: (id: string, messages: ConversationMessage[], transactionId: string) => {
        set((state) => {
          const existingIndex = state.conversations.findIndex(c => c.id === id);

          if (existingIndex >= 0) {
            // Update existing
            const updated = [...state.conversations];
            updated[existingIndex] = {
              ...updated[existingIndex],
              messages,
              transactionId,
              title: messages.length > 0 ? generateTitle(messages) : updated[existingIndex].title,
              updatedAt: Date.now(),
            };
            return { conversations: updated };
          } else {
            // Create new
            const newConversation: Conversation = {
              id,
              title: generateTitle(messages),
              messages,
              transactionId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            return {
              conversations: [newConversation, ...state.conversations],
              activeConversationId: id,
            };
          }
        });
      },

      deleteConversation: (id: string) => {
        set((state) => {
          const newConversations = state.conversations.filter(c => c.id !== id);
          const newActiveId = state.activeConversationId === id
            ? (newConversations.length > 0 ? newConversations[0].id : null)
            : state.activeConversationId;

          return {
            conversations: newConversations,
            activeConversationId: newActiveId,
          };
        });
      },

      renameConversation: (id: string, title: string) => {
        set((state) => {
          const updated = state.conversations.map(c =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          );
          return { conversations: updated };
        });
      },

      setActiveConversation: (id: string | null) => {
        set({ activeConversationId: id });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setSidebarOpen: (open: boolean) => {
        set({ sidebarOpen: open });
      },

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        if (!activeConversationId) return null;
        return conversations.find(c => c.id === activeConversationId) || null;
      },
    }),
    {
      name: 'polarhub-conversations',
      version: 1,
    }
  )
);

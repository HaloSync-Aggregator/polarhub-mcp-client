/**
 * Chat Container Component - Main chat interface
 */

import { useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import { WelcomeScreen } from './WelcomeScreen';
import { ChatInput } from './ChatInput';
import { ChatMessage, ChatMessageLoading } from './ChatMessage';

function getWsUrl(): string {
  if (import.meta.env.VITE_BRIDGE_WS_URL) {
    return import.meta.env.VITE_BRIDGE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
const WS_URL = getWsUrl();

export function ChatContainer() {
  const {
    connected,
    messages,
    isLoading,
    connect,
    sendMessage,
    sendAction,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Connect to WebSocket on mount
  useEffect(() => {
    console.log('ChatContainer: Connecting to', WS_URL);
    connect(WS_URL);
  }, [connect]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = (content: string) => {
    sendMessage(content);
  };

  const handleSuggestionClick = (message: string) => {
    sendMessage(message);
  };

  const handleAction = (action: string, payload: Record<string, unknown>) => {
    sendAction(action, payload);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onAction={handleAction}
              />
            ))}
            {isLoading && <ChatMessageLoading />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={!connected || isLoading}
        placeholder={
          !connected
            ? '서버에 연결 중...'
            : isLoading
            ? '응답을 기다리는 중...'
            : '메시지를 입력하세요...'
        }
      />
    </div>
  );
}

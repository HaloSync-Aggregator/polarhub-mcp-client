/**
 * Chat Message Component - HaloSync Design System
 *
 * Renders chat messages with JSON tool results.
 */

import { clsx } from 'clsx';
import type { ConversationMessage } from '@polarhub-demo/shared';
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FalconMark } from '../common/Logo';

interface ChatMessageProps {
  message: ConversationMessage;
  onAction?: (action: string, payload: Record<string, unknown>) => void;
}

// Developer mode check (localStorage or URL parameter)
const isDevMode = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('devMode') === 'true' ||
         new URLSearchParams(window.location.search).has('dev');
};

export function ChatMessage({ message, onAction }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const showDevTools = isDevMode();

  void onAction; // Reserved for future use (legacy callback)

  // Tool call status indicator
  if (isSystem && message.toolCall) {
    return (
      <div
        className="flex items-center gap-2 text-text-muted text-sm py-2 px-4"
        data-tool-status={message.toolCall.status}
        data-tool-name={message.toolCall.name}
      >
        {message.toolCall.status === 'pending' && (
          <Loader2 size={14} className="animate-spin text-halo-purple" />
        )}
        {message.toolCall.status === 'success' && (
          <CheckCircle size={14} className="text-halo-green" />
        )}
        {message.toolCall.status === 'error' && (
          <XCircle size={14} className="text-status-error" />
        )}
        <span>{message.content}</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex w-full animate-fade-in',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={clsx(
          'max-w-[85%] md:max-w-[75%]',
          isUser ? 'order-2' : 'order-1'
        )}
      >
        {/* Avatar for assistant */}
        {isAssistant && (
          <div className="flex items-start gap-3">
            <FalconMark size={32} className="flex-shrink-0 mt-1" />
            <div className="flex-1 space-y-3">
              {/* Text content */}
              <div className="bg-bg-secondary text-text-primary rounded-2xl rounded-tl-md px-4 py-3 shadow-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-table:my-2 prose-hr:my-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>

              {/* Tool Result - JSON Display (Developer Mode Only) */}
              {showDevTools && message.toolResult && (
                <div className="mt-3 bg-bg-tertiary rounded-xl overflow-hidden border border-border-light">
                  <button
                    onClick={() => setIsJsonExpanded(!isJsonExpanded)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                  >
                    {isJsonExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    <span className="font-medium">Tool Result (JSON)</span>
                  </button>
                  {isJsonExpanded && (
                    <pre className="px-4 py-3 text-xs overflow-x-auto bg-bg-secondary border-t border-border-light max-h-96 font-mono">
                      {JSON.stringify(message.toolResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User message */}
        {isUser && (
          <div className="bg-halo-purple text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}

        {/* System message (non-tool) */}
        {isSystem && !message.toolCall && (
          <div className="bg-status-warning-light text-text-primary rounded-xl px-4 py-2 text-sm border border-status-warning/20">
            <p>{message.content}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Loading indicator for pending assistant response
 */
export function ChatMessageLoading() {
  return (
    <div className="flex w-full justify-start animate-fade-in">
      <div className="flex items-start gap-3">
        <FalconMark size={32} className="flex-shrink-0 mt-1" />
        <div className="bg-bg-secondary rounded-2xl rounded-tl-md px-4 py-4 shadow-sm">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

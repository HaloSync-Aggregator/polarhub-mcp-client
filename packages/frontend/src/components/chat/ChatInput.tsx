/**
 * Chat Input Component - HaloSync Design System
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic } from 'lucide-react';
import { tf } from '../../i18n';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = tf('chat.placeholder'),
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setMessage('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border-light bg-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-3 bg-bg-secondary border border-border-light rounded-2xl p-2 focus-within:border-halo-purple focus-within:ring-1 focus-within:ring-halo-purple transition-all duration-300">
          {/* Attachment button (future feature) */}
          <button
            className="p-2 text-text-muted hover:text-halo-purple hover:bg-halo-purple-light rounded-lg transition-colors"
            title={tf('chat.attachFile')}
            disabled
          >
            <Paperclip size={18} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="
              flex-1 bg-transparent border-0
              text-text-primary placeholder:text-text-muted
              focus:outline-none
              resize-none overflow-hidden
              disabled:opacity-50 disabled:cursor-not-allowed
              py-2 px-1
            "
          />

          {/* Voice input button (future feature) */}
          <button
            className="p-2 text-text-muted hover:text-halo-purple hover:bg-halo-purple-light rounded-lg transition-colors"
            title={tf('chat.voiceInput')}
            disabled
          >
            <Mic size={18} />
          </button>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || !message.trim()}
            className="
              w-10 h-10 flex items-center justify-center
              bg-halo-purple text-white rounded-xl
              hover:bg-halo-purple-hover
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300
              flex-shrink-0
              shadow-sm hover:shadow-md
            "
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2 text-center">
          {tf('chat.sendHint')}
        </p>
      </div>
    </div>
  );
}

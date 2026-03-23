/**
 * Sidebar Component - Conversation History
 * HaloSync Design System
 */

import { useState } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { useChatStore, useConversationStore, type Conversation } from '../../store';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  const handleRename = () => {
    if (editTitle.trim()) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday =
      new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

    if (isToday) return '오늘';
    if (isYesterday) return '어제';
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
        isActive
          ? 'bg-halo-purple/10 text-halo-purple'
          : 'hover:bg-bg-hover text-text-secondary hover:text-text-primary'
      }`}
      onClick={onSelect}
      onMouseLeave={() => setShowMenu(false)}
    >
      <MessageSquare size={18} className="flex-shrink-0" />

      {isEditing ? (
        <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 px-2 py-1 text-sm bg-white border border-halo-purple rounded-lg focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
          />
          <button
            onClick={handleRename}
            className="p-1 hover:bg-halo-green/10 rounded text-halo-green"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="p-1 hover:bg-status-error-light rounded text-status-error"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{conversation.title}</p>
            <p className="text-xs text-text-muted">{formatDate(conversation.updatedAt)}</p>
          </div>

          <div
            className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
              showMenu ? 'opacity-100' : ''
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-bg-tertiary rounded"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          {showMenu && (
            <div
              className="absolute right-2 top-full mt-1 bg-white border border-border-light rounded-xl shadow-lg py-1 z-10 min-w-[120px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-bg-hover"
              >
                <Edit3 size={14} />
                이름 변경
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-status-error hover:bg-status-error-light"
              >
                <Trash2 size={14} />
                삭제
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Sidebar() {
  const { newConversation, loadConversation, currentConversationId, deleteConversation } = useChatStore();
  const {
    conversations,
    renameConversation,
    sidebarOpen,
    toggleSidebar,
  } = useConversationStore();

  // Group conversations by date
  const groupedConversations = conversations.reduce(
    (groups, conv) => {
      const date = new Date(conv.updatedAt);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const isYesterday =
        new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
      const isThisWeek =
        date.getTime() > now.getTime() - 7 * 86400000 && !isToday && !isYesterday;

      let key: string;
      if (isToday) key = '오늘';
      else if (isYesterday) key = '어제';
      else if (isThisWeek) key = '이번 주';
      else key = '이전';

      if (!groups[key]) groups[key] = [];
      groups[key].push(conv);
      return groups;
    },
    {} as Record<string, Conversation[]>
  );

  const groupOrder = ['오늘', '어제', '이번 주', '이전'];

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-72' : 'w-0'
        } flex-shrink-0 bg-bg-sidebar border-r border-border-light flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border-light">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-halo-purple text-white rounded-full font-medium hover:bg-halo-purple-hover transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <Plus size={18} />
            새 대화
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {groupOrder.map((group) => {
            const convs = groupedConversations[group];
            if (!convs || convs.length === 0) return null;

            return (
              <div key={group}>
                <h3 className="text-xs font-semibold text-text-muted px-3 mb-2 uppercase tracking-wider">
                  {group}
                </h3>
                <div className="space-y-1">
                  {convs.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === currentConversationId}
                      onSelect={() => loadConversation(conv.id)}
                      onDelete={() => deleteConversation(conv.id)}
                      onRename={(title) => renameConversation(conv.id, title)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {conversations.length === 0 && (
            <div className="text-center py-8 text-text-muted">
              <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">대화 내역이 없습니다</p>
              <p className="text-xs mt-1">새 대화를 시작해보세요</p>
            </div>
          )}
        </div>
      </aside>

      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className={`absolute ${
          sidebarOpen ? 'left-[272px]' : 'left-0'
        } top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white border border-border-light rounded-r-lg shadow-sm hover:bg-bg-hover transition-all duration-300`}
      >
        {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </>
  );
}

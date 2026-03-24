/**
 * Header Component - HaloSync Design System
 */

import { Wifi, WifiOff, Menu } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConversationStore } from '../../store/conversationStore';
import { tf } from '../../i18n';

export function Header() {
  const { connected } = useChatStore();
  const { toggleSidebar, sidebarOpen } = useConversationStore();

  return (
    <header className="h-16 border-b border-border-light bg-white flex items-center justify-between px-4 z-20">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-bg-hover rounded-lg transition-colors lg:hidden"
          aria-label={sidebarOpen ? tf('header.closeSidebar') : tf('header.openSidebar')}
        >
          <Menu size={20} className="text-text-secondary" />
        </button>

        {/* Logo */}
        <img src="/logo.png" alt="HaloSync" className="h-8" />
      </div>

      {/* Center section */}
      <div className="hidden md:flex items-center gap-4">
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Connection Status */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
            connected
              ? 'bg-halo-green-light text-halo-green'
              : 'bg-status-error-light text-status-error'
          }`}
        >
          <div className={`status-dot ${connected ? 'status-dot-online' : 'status-dot-offline'}`} />
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">{connected ? tf('header.connected') : tf('header.disconnected')}</span>
        </div>
      </div>
    </header>
  );
}

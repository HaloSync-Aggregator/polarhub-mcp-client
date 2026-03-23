/**
 * Main Layout Component - HaloSync Design System
 * Includes Header, Sidebar, and main content area
 */

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-bg-chat">
      {/* Header */}
      <Header />

      {/* Main content area with sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

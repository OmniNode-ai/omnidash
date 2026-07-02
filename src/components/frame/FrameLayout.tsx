// SOURCE: Claude Design prototype
//   React:   src/app.jsx:208-251 (`.app` div structure)
//   Styling: OmniDash.html:93-95 (`.app { display:grid; grid-template-columns:240px 1fr; height:100vh; }`)
// Deviations from source:
//   - Sidebar is received as a direct import (vs. hardcoded in prototype) for composability.
//   - OMN-47: CSS ported verbatim to src/styles/sidebar.css + topbar.css; TSX rewritten to use prototype class names.

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { DataModeBanner } from './DataModeBanner';
import { useFrameStore } from '@/store/store';

interface FrameLayoutProps {
  children: ReactNode;
}

export function FrameLayout({ children }: FrameLayoutProps) {
  const sidebarCollapsed = useFrameStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useFrameStore((s) => s.setSidebarCollapsed);
  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar />
      {/* OMN-12833 (WS5): closes the mobile sidebar overlay when the user clicks
          outside it. CSS hides this element above 1024px so it has no effect
          on desktop even when the sidebar is expanded there. */}
      {!sidebarCollapsed && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarCollapsed(true)}
          aria-hidden="true"
        />
      )}
      <div className="main">
        <DataModeBanner />
        {children}
      </div>
    </div>
  );
}

// SOURCE: Claude Design prototype
//   React:   src/app.jsx:208-251 (`.app` div structure)
//   Styling: OmniDash.html:93-95 (`.app { display:grid; grid-template-columns:240px 1fr; height:100vh; }`)
// Deviations from source:
//   - Sidebar is received as a direct import (vs. hardcoded in prototype) for composability.
//   - OMN-47: CSS ported verbatim to src/styles/sidebar.css + topbar.css; TSX rewritten to use prototype class names.

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';

interface FrameLayoutProps {
  children: ReactNode;
}

export function FrameLayout({ children }: FrameLayoutProps) {
  const sidebarCollapsed = useFrameStore((s) => s.sidebarCollapsed);
  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar />
      <div className="main">
        {children}
      </div>
    </div>
  );
}

// SOURCE: Claude Design prototype
//   React:   src/app.jsx:208-251 (`.app` div structure)
//   Styling: OmniDash.html:93-95 (`.app { display:grid; grid-template-columns:240px 1fr; height:100vh; }`)
// Deviations from source:
//   - Tailwind `grid grid-cols-[240px_1fr] h-screen` replaces vanilla CSS class `.app`.
//   - Sidebar is received as a prop (vs. hardcoded in prototype) for composability.
//   - Children render in `.main` which is a flex column (Topbar + DashboardView stacked).

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface FrameLayoutProps {
  children: ReactNode;
}

export function FrameLayout({ children }: FrameLayoutProps) {
  return (
    <div className="grid grid-cols-[240px_1fr] h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col min-w-0 bg-bg overflow-hidden">
        {children}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Header } from './Header';
import * as s from './FrameLayout.css';

export function FrameLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.frameContainer}>
      <div className={s.headerArea}>
        <Header />
      </div>
      <div className={s.sidebarArea}>
        {/* Sidebar mounted by parent with dashboard list */}
      </div>
      <main className={s.mainArea}>
        {children}
      </main>
    </div>
  );
}

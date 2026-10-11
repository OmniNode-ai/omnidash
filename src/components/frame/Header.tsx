// SOURCE: Claude Design prototype
//   React:   src/app.jsx:423-451 (Topbar component)
//   Styling: OmniDash.html:242-326 (.topbar, .breadcrumbs, .topbar-right, .icon-btn, .user-chip)
// Deviations from source:
//   - Theme toggle retained from OMN-38 (toggling `data-theme` attribute on <html>).
//   - "+ New dashboard" inline form removed — new-dashboard flow moved to Sidebar (OMN-43).
//   - OMN-19981: current breadcrumb follows the canonical page URL.
//   - OMN-47: CSS ported verbatim to src/styles/topbar.css; TSX rewritten to use prototype class names.
//   - Post-OMN-48: removed the user chip (#23), Bell + HelpCircle buttons (#24), and the
//     breadcrumb Menu icon (#28). None of them had a real system behind them — no users,
//     no notifications, no help, and the Menu icon looked like an interactive hamburger
//     control but had no onClick. Keeping them invited users to click things that did
//     nothing.

import { useState } from 'react';
import { useLocation } from 'wouter';
import { PAGE_LABELS, pageForPath } from '@/navigation/page-routes';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { Moon, RefreshCw, Sun } from 'lucide-react';
import { requestLocalPageRefresh } from '@/services/local-page-refresh';

// Length of the visual spin after a manual refresh. Long enough to
// register as deliberate feedback, short enough that a chain of
// quick clicks doesn't queue up animations forever (the second
// click while spinning just resets the timer below).
const SPIN_DURATION_MS = 700;

export function Header() {
  const [location] = useLocation();
  const page = pageForPath(location);
  const pageLabel = page ? PAGE_LABELS[page] : 'Page not found';
  const { theme, setTheme, availableThemes } = useTheme();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const nextThemeName = availableThemes[(availableThemes.indexOf(theme) + 1) % availableThemes.length];
  const nextTheme = () => setTheme(nextThemeName);

  // Manual refresh: invalidate every cached query so React Query
  // refetches the active ones in place. No page reload, same hard
  // constraint as OMN-126 — full reloads would interrupt edit mode,
  // drag-in-progress, and modal state.
  const handleRefresh = () => {
    void queryClient.invalidateQueries();
    requestLocalPageRefresh();
    setIsRefreshing(true);
    window.setTimeout(() => setIsRefreshing(false), SPIN_DURATION_MS);
  };

  return (
    <header className="topbar">
      {/* Left — breadcrumbs */}
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span className="cur" aria-current="page">{pageLabel}</span>
      </nav>

      {/* Right — action cluster */}
      <div className="topbar-right">
        <button
          className="icon-btn"
          title="Refresh"
          aria-label="Refresh"
          onClick={handleRefresh}
        >
          <RefreshCw size={16} className={isRefreshing ? 'spin-once' : undefined} />
        </button>

        {/* Theme toggle (retained from OMN-38) */}
        <button
          className="icon-btn"
          onClick={nextTheme}
          aria-label="Toggle theme"
          title={`Switch to ${nextThemeName} theme`}
        >
          {nextThemeName === 'light'
            ? <Sun size={16} aria-hidden="true" />
            : <Moon size={16} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

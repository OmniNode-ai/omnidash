// SOURCE: Claude Design prototype
//   React:   src/app.jsx:423-451 (Topbar component)
//   Styling: OmniDash.html:242-326 (.topbar, .breadcrumbs, .topbar-right, .icon-btn, .user-chip)
// Deviations from source:
//   - Theme toggle retained from OMN-38 (toggling `data-theme` attribute on <html>).
//   - "+ New dashboard" inline form removed — new-dashboard flow moved to Sidebar (OMN-43).
//   - Real breadcrumb navigation deferred; static "Home / Dashboards" for now.
//   - OMN-47: CSS ported verbatim to src/styles/topbar.css; TSX rewritten to use prototype class names.
//   - Post-OMN-48: removed the user chip (#23), Bell + HelpCircle buttons (#24), and the
//     breadcrumb Menu icon (#28). None of them had a real system behind them — no users,
//     no notifications, no help, and the Menu icon looked like an interactive hamburger
//     control but had no onClick. Keeping them invited users to click things that did
//     nothing.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme';
import { Text } from '@/components/ui/typography';
import { RefreshCw } from 'lucide-react';

// Length of the visual spin after a manual refresh. Long enough to
// register as deliberate feedback, short enough that a chain of
// quick clicks doesn't queue up animations forever (the second
// click while spinning just resets the timer below).
const SPIN_DURATION_MS = 700;

export function Header() {
  const { theme, setTheme, availableThemes } = useTheme();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const nextTheme = () => {
    const idx = availableThemes.indexOf(theme);
    const next = availableThemes[(idx + 1) % availableThemes.length];
    setTheme(next);
  };

  // Manual refresh: invalidate every cached query so React Query
  // refetches the active ones in place. No page reload, same hard
  // constraint as OMN-126 — full reloads would interrupt edit mode,
  // drag-in-progress, and modal state.
  const handleRefresh = () => {
    void queryClient.invalidateQueries();
    setIsRefreshing(true);
    window.setTimeout(() => setIsRefreshing(false), SPIN_DURATION_MS);
  };

  return (
    <header className="topbar">
      {/* Left — breadcrumbs */}
      <nav className="breadcrumbs">
        <span>Home</span>
        <span className="sep">/</span>
        <span className="cur">Dashboards</span>
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
          style={{ width: 'auto', padding: '0 10px' }}
          onClick={nextTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          <Text size="md" weight="medium" color="inherit">{theme}</Text>
        </button>
      </div>
    </header>
  );
}

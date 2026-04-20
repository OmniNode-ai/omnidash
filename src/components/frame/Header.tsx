// SOURCE: Claude Design prototype
//   React:   src/app.jsx:423-451 (Topbar component)
//   Styling: OmniDash.html:242-326 (.topbar, .breadcrumbs, .topbar-right, .icon-btn, .user-chip)
// Deviations from source:
//   - Tailwind utility classes replace vanilla CSS.
//   - Theme toggle retained from OMN-38 (toggling `data-theme` attribute on <html>).
//   - "+ New dashboard" inline form removed — new-dashboard flow moved to Sidebar (OMN-43).
//   - Real breadcrumb navigation deferred; static "Home / Dashboards" for now.
//   - Avatar initials static "JS" as in prototype; user system out of scope.

import { useTheme } from '@/theme';
import { RefreshCw, HelpCircle, Bell, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Header() {
  const { theme, setTheme, availableThemes } = useTheme();

  const nextTheme = () => {
    const idx = availableThemes.indexOf(theme);
    const next = availableThemes[(idx + 1) % availableThemes.length];
    setTheme(next);
  };

  return (
    <header className="h-[52px] flex-shrink-0 flex items-center justify-between px-5 border-b border-line bg-panel">
      {/* Left — breadcrumbs */}
      <div className="flex items-center gap-2 text-ink-2 text-[13px]">
        <Menu size={16} />
        <span>Home</span>
        <span className="text-ink-3">/</span>
        <span className="text-ink font-medium">Dashboards</span>
      </div>

      {/* Right — action cluster */}
      <div className="flex items-center gap-1.5">
        <button
          className="w-[34px] h-[34px] rounded-md grid place-items-center text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={16} />
        </button>
        <button
          className="w-[34px] h-[34px] rounded-md grid place-items-center text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          title="Help"
          aria-label="Help"
        >
          <HelpCircle size={16} />
        </button>
        <button
          className="relative w-[34px] h-[34px] rounded-md grid place-items-center text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-[6px] right-[7px] w-[7px] h-[7px] rounded-full bg-status-bad"
                style={{ boxShadow: '0 0 0 2px var(--panel)' }} />
        </button>

        {/* Theme toggle (retained from OMN-38) */}
        <button
          className={cn(
            'h-[34px] px-3 rounded-md text-[12px] font-medium text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink',
          )}
          onClick={nextTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme}
        </button>

        {/* User chip */}
        <div className="flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-full ml-1.5 border border-line transition-colors hover:bg-panel-2 cursor-pointer">
          <div className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold bg-[var(--accent-soft)] text-[var(--accent-ink)]">
            JS
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[13px] font-medium text-ink">Jamie Sun</span>
            <span className="text-[11px] text-ink-2">Platform Eng</span>
          </div>
        </div>
      </div>
    </header>
  );
}

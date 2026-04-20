// SOURCE: Claude Design prototype
//   React:   src/app.jsx:339-422
//   Styling: OmniDash.html:93-240
// Deviations from source:
//   - Replaced vanilla CSS classes with Tailwind utility classes (prototype uses CSS-in-HTML).
//   - Exotic `oklch` values expressed as Tailwind arbitrary-value syntax.
//   - `...` kebab menu implemented via shadcn DropdownMenu instead of a custom positioned div.
//   - Rename in-place handled via local `renamingId` state rather than lifted to App.
//   - Wired to Zustand store (dashboards, activeDashboardId, createDashboard, renameDashboard,
//     deleteDashboard, setActiveDashboardById) instead of receiving all as props.
//   - "Platform Eng" workspace chip is static (dynamic workspaces are out of scope).

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFrameStore } from '@/store/store';
import { cn } from '@/lib/utils';

/** Inline OmniDash brand-mark SVG from prototype (visual fidelity preferred over lucide Hexagon). */
function BrandMark() {
  return (
    <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(70% 0.14 230)" />
          <stop offset="55%" stopColor="oklch(75% 0.13 200)" />
          <stop offset="100%" stopColor="oklch(82% 0.14 170)" />
        </linearGradient>
      </defs>
      {/* hexagon outer */}
      <path
        d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
        stroke="url(#bm-g)"
        strokeWidth="2.2"
        strokeLinejoin="miter"
      />
      {/* angular D-chevron inside */}
      <path
        d="M11 9 L11 23 L17 23 L22 18 L22 14 L17 9 Z"
        stroke="url(#bm-g)"
        strokeWidth="2"
        strokeLinejoin="miter"
        fill="none"
      />
      <path d="M14 14 L18 18" stroke="url(#bm-g)" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

interface RenameInputProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function RenameInput({ initialValue, onCommit, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      autoFocus
      defaultValue={initialValue}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') onCancel();
      }}
      className="bg-transparent border-0 outline-0 text-sidebar-ink font-[inherit] text-[13px] w-full leading-tight"
    />
  );
}

export function Sidebar() {
  const { dashboards, activeDashboardId, createDashboard, renameDashboard, deleteDashboard, setActiveDashboardById } =
    useFrameStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleCreate = () => {
    const nd = createDashboard('Untitled Dashboard');
    setRenamingId(nd.id);
  };

  const handleRenameCommit = (id: string, value: string) => {
    renameDashboard(id, value);
    setRenamingId(null);
  };

  const handleRenameCancel = (id: string) => {
    // If name is still "Untitled Dashboard" and we cancel, keep it
    setRenamingId(null);
    void id;
  };

  return (
    <aside className="bg-sidebar text-sidebar-ink flex flex-col border-r border-sidebar-line h-full">
      {/* Brand block */}
      <div className="px-4 py-[18px] pb-3.5 border-b border-sidebar-line flex items-center gap-2.5">
        <BrandMark />
        <div className="font-semibold text-[15px] tracking-tight flex flex-col leading-none">
          <span className="text-sidebar-ink">
            Omni<em className="not-italic text-[var(--accent)]">Dash</em>
          </span>
          <span className="font-mono text-[9px] font-medium tracking-[0.1em] uppercase text-sidebar-ink-2 opacity-70 mt-0.5">
            an omninode product
          </span>
        </div>
      </div>

      {/* Workspace chip */}
      <div className="px-3.5 py-3 border-b border-sidebar-line text-xs text-sidebar-ink-2">
        <div className="text-[10px] uppercase tracking-[0.08em]">Workspace</div>
        <div className="mt-1.5 flex items-center justify-between bg-[oklch(26%_0.01_260)] text-sidebar-ink px-2.5 py-2 rounded-md cursor-pointer border border-sidebar-line transition-colors hover:bg-[oklch(30%_0.01_260)]">
          <span className="font-medium text-[13px]">Platform Eng</span>
          <ChevronDown size={14} />
        </div>
      </div>

      {/* Section header */}
      <div className="px-2.5 pt-3.5 pb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.09em] text-sidebar-ink-2 font-semibold px-1.5">
          Dashboards
        </span>
        <button
          aria-label="New dashboard"
          onClick={handleCreate}
          className="w-[22px] h-[22px] rounded-full grid place-items-center bg-sidebar-ink text-sidebar transition-all duration-150 hover:bg-[var(--accent)] hover:scale-[1.08] active:scale-95"
        >
          <Plus size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Dashboard list */}
      <div className="px-2 flex-1 overflow-y-auto flex flex-col gap-px">
        {dashboards.map((d, i) => {
          const isActive = d.id === activeDashboardId;
          return (
            <div
              key={d.id}
              data-testid={`dash-item-${d.id}`}
              className={cn(
                'grid items-center gap-2 px-2.5 py-[7px] text-[13px] cursor-pointer rounded-none transition-colors duration-150',
                'grid-cols-[14px_1fr_20px]',
                isActive
                  ? 'text-sidebar-ink font-medium bg-transparent'
                  : 'text-sidebar-ink-2 hover:text-sidebar-ink hover:bg-[oklch(22%_0.01_260)]',
              )}
              onClick={() => setActiveDashboardById(d.id)}
            >
              {/* Marker */}
              <span
                className={cn(
                  'font-mono text-[12px] text-center leading-none',
                  isActive ? 'text-[var(--accent)] opacity-100' : 'text-sidebar-ink-2 opacity-45',
                )}
              >
                {isActive ? '▸' : String(i + 1).padStart(2, '0')}
              </span>

              {/* Name or inline rename */}
              {renamingId === d.id ? (
                <RenameInput
                  initialValue={d.name}
                  onCommit={(val) => handleRenameCommit(d.id, val)}
                  onCancel={() => handleRenameCancel(d.id)}
                />
              ) : (
                <span
                  className="truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(d.id);
                  }}
                >
                  {d.name}
                </span>
              )}

              {/* Kebab menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Dashboard options for ${d.name}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'w-5 h-5 rounded grid place-items-center transition-all duration-150',
                      'opacity-0 group-hover:opacity-100',
                      isActive ? 'opacity-100' : 'opacity-0',
                      'hover:opacity-100 hover:bg-[oklch(36%_0.01_260)]',
                      '[.dash-item:hover_&]:opacity-100',
                    )}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-36">
                  <DropdownMenuItem
                    onSelect={() => setRenamingId(d.id)}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => deleteDashboard(d.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        {dashboards.length === 0 && (
          <div className="px-3 py-5 text-[12px] text-sidebar-ink-2 text-center leading-relaxed">
            No dashboards yet.
            <br />
            <button
              onClick={handleCreate}
              className="text-[var(--accent)] underline mt-1"
            >
              Create your first one →
            </button>
          </div>
        )}
      </div>

      {/* Sidebar foot */}
      <div className="px-3.5 py-2.5 border-t border-sidebar-line flex items-center gap-2.5 text-[12px] text-sidebar-ink-2">
        <span
          aria-label="pulse dot"
          className="w-2 h-2 rounded-full bg-status-ok animate-pulse"
          style={{ boxShadow: '0 0 0 3px oklch(70% 0.15 145 / 0.15)' }}
        />
        <span>All systems normal</span>
        <span className="ml-auto font-mono text-[11px]">v2.14</span>
      </div>
    </aside>
  );
}

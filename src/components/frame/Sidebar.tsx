// SOURCE: Claude Design prototype
//   React:   src/app.jsx:339-422
//   Styling: OmniDash.html:93-240
// Deviations from source:
//   - `...` kebab menu implemented via shadcn DropdownMenu instead of a custom positioned div.
//   - Rename in-place handled via local `renamingId` state rather than lifted to App.
//   - Wired to Zustand store (dashboards, activeDashboardId, createDashboard, renameDashboard,
//     deleteDashboard, setActiveDashboardById) instead of receiving all as props.
//   - "Platform Eng" workspace chip is static (dynamic workspaces are out of scope).
//   - OMN-47: CSS ported verbatim to src/styles/sidebar.css; TSX rewritten to use prototype class names.

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

/** Inline OmniDash brand-mark SVG from prototype (visual fidelity preferred over lucide Hexagon). */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" fill="none">
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
    setRenamingId(null);
    void id;
  };

  return (
    <aside className="sidebar">
      {/* Brand block */}
      <div className="brand">
        <BrandMark />
        <div className="brand-name">
          <span className="primary">
            Omni<em>Dash</em>
          </span>
          <span className="parent">an omninode product</span>
        </div>
      </div>

      {/* Workspace chip */}
      <div className="workspace">
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Workspace
        </div>
        <div className="workspace-chip">
          <span className="ws-name">Platform Eng</span>
          <ChevronDown size={14} />
        </div>
      </div>

      {/* Section header */}
      <div className="nav-section">
        <span className="nav-section-title">Dashboards</span>
        <button
          aria-label="New dashboard"
          title="New dashboard"
          onClick={handleCreate}
          className="nav-new"
        >
          <Plus size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Dashboard list */}
      <div className="dash-list">
        {dashboards.map((d, i) => {
          const isActive = d.id === activeDashboardId;
          return (
            <div
              key={d.id}
              data-testid={`dash-item-${d.id}`}
              className={`dash-item${isActive ? ' active' : ''}`}
              onClick={() => setActiveDashboardById(d.id)}
            >
              {/* Marker */}
              <span className="dash-marker">
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
                  className="dash-name"
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
                    className="dash-kebab"
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
          <div style={{ padding: '20px 12px', fontSize: '12px', color: 'var(--sidebar-ink-2)', textAlign: 'center', lineHeight: 1.5 }}>
            No dashboards yet.
            <br />
            <button
              onClick={handleCreate}
              style={{ color: 'var(--brand)', textDecoration: 'underline', marginTop: '4px' }}
            >
              Create your first one →
            </button>
          </div>
        )}
      </div>

      {/* Sidebar foot */}
      <div className="sidebar-foot">
        <span
          className="dot"
          aria-label="pulse dot"
        />
        <span>All systems normal</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '11px' }}>v2.15</span>
      </div>
    </aside>
  );
}

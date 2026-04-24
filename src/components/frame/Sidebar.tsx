// SOURCE: Claude Design prototype
//   React:   src/app.jsx:339-422
//   Styling: OmniDash.html:93-240
// Deviations from source:
//   - Rename in-place handled via local `renamingId` state rather than lifted to App.
//   - Wired to Zustand store (dashboards, activeDashboardId, createDashboard, renameDashboard,
//     deleteDashboard, setActiveDashboardById) instead of receiving all as props.
//   - OMN-47: CSS ported verbatim to src/styles/sidebar.css; TSX rewritten to use prototype class names.
//   - Post-OMN-48: "Platform Eng" workspace chip removed — it was static markup with no behavior
//     wired, and the product has no workspaces concept yet.
//   - Widget-menu infrastructure (PositionedMenu) is also used here for the dashboard kebab,
//     keeping the menu pattern consistent with the prototype across the whole app.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Edit, Copy, Share2, Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { Text } from '@/components/ui/typography';
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select after React has finished applying defaultValue but before the
  // browser paints. Doing this in the callback ref raced against React's value
  // assignment; `useLayoutEffect` guarantees the value string is in place.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  // Commit only on genuine user "click outside" — a real pointerdown whose target
  // is outside this input. This avoids committing on spurious blur events caused
  // by Radix's DropdownMenu focus-management teardown.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const input = inputRef.current;
      if (!input) return;
      if (e.target instanceof Node && input.contains(e.target)) return;
      onCommit(input.value);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onCommit]);

  return (
    <input
      ref={inputRef}
      defaultValue={initialValue}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        if (e.key === 'Escape') onCancel();
      }}
      style={{
        background: 'oklch(28% 0.01 260)',
        border: '1px solid var(--brand)',
        borderRadius: 4,
        outline: 'none',
        color: 'var(--sidebar-ink)',
        font: 'inherit',
        width: '100%',
        padding: '2px 6px',
        margin: '-2px -6px',
      }}
    />
  );
}

interface DashboardKebabProps {
  dashboardName: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Per-row kebab menu. Hook state must be per-row so each menu positions from its own trigger. */
function DashboardKebab({ dashboardName, onRename, onDuplicate, onDelete }: DashboardKebabProps) {
  const menu = usePositionedMenu();
  return (
    <>
      <button
        aria-label={`Dashboard options for ${dashboardName}`}
        className="dash-kebab"
        onClick={menu.open}
      >
        <MoreHorizontal size={14} />
      </button>
      {menu.isOpen && (
        <PositionedMenu anchor={menu.anchor} onClose={menu.close} placement="right-start">
          <MenuItem onSelect={menu.select(onRename)}>
            <Edit size={14} /> Rename
          </MenuItem>
          <MenuItem onSelect={menu.select(onDuplicate)}>
            <Copy size={14} /> Duplicate
          </MenuItem>
          <MenuItem onSelect={menu.select(() => { /* Share link — no-op until wired */ })}>
            <Share2 size={14} /> Share Link
          </MenuItem>
          <MenuSeparator />
          <MenuItem variant="danger" onSelect={menu.select(onDelete)}>
            <Trash2 size={14} /> Delete
          </MenuItem>
        </PositionedMenu>
      )}
    </>
  );
}

export function Sidebar() {
  const {
    dashboards,
    activeDashboardId,
    createDashboard,
    renameDashboard,
    deleteDashboard,
    duplicateDashboard,
    setActiveDashboardById,
  } = useFrameStore();

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

              {/* Kebab menu (PositionedMenu — prototype pattern) */}
              <DashboardKebab
                dashboardName={d.name}
                onRename={() => setRenamingId(d.id)}
                onDuplicate={() => duplicateDashboard(d.id)}
                onDelete={() => deleteDashboard(d.id)}
              />
            </div>
          );
        })}

        {dashboards.length === 0 && (
          <Text
            as="div"
            size="md"
            leading="loose"
            align="center"
            style={{ padding: '20px 12px', color: 'var(--sidebar-ink-2)' }}
          >
            No dashboards yet.
            <br />
            <button
              onClick={handleCreate}
              style={{ color: 'var(--brand)', textDecoration: 'underline', marginTop: '4px' }}
            >
              Create your first one →
            </button>
          </Text>
        )}
      </div>

    </aside>
  );
}

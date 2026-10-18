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

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocation } from 'wouter';
import { Activity, BadgeCheck, Blocks, ChartColumn, Gauge, LayoutDashboard, LockKeyhole, SlidersHorizontal, Workflow, ChevronsLeft, ChevronsRight, Copy, Edit, FlaskConical, KeyRound, MoreHorizontal, Plus, Radio, Trash2 } from 'lucide-react';
// Grid3x3 removed from import while Instruction Eval nav entry is commented out (OMN-12833 A4).
import type { AppPage } from '@/store/types';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { DeleteDashboardDialog } from './DeleteDashboardDialog';
import { PAGE_PATHS, pageForPath } from '@/navigation/page-routes';

/** The six local pages (requirements FR-3), in the required order. `partial`: its exposure is not served yet. */
const LOCAL_PAGES: ReadonlyArray<{ page: AppPage; label: string; icon: React.ReactNode; partial: boolean }> = [
  { page: 'local-overview', label: 'Overview', icon: <LayoutDashboard size={16} />, partial: false },
  { page: 'local-runs', label: 'Runs', icon: <Activity size={16} />, partial: false },
  { page: 'local-workflow', label: 'Workflow', icon: <Workflow size={16} />, partial: false },
  { page: 'local-usage', label: 'Usage', icon: <ChartColumn size={16} />, partial: true },
  { page: 'local-credentials', label: 'Credentials', icon: <KeyRound size={16} />, partial: true },
  { page: 'local-api-keys', label: 'API Keys', icon: <LockKeyhole size={16} />, partial: true },
];

// Deferred from the default MVP surface; the legacy implementation and stores
// stay intact. Developer tools never enable custom dashboard editing.
const SHOW_CUSTOM_DASHBOARDS = false;
const DEVELOPER_PAGES: ReadonlyArray<{ page: AppPage; label: string; icon: React.ReactNode }> = [
  { page: 'experiments', label: 'Experimentation', icon: <FlaskConical size={16} /> },
  { page: 'sea-control', label: 'Agent Workbench', icon: <Blocks size={16} /> },
  { page: 'event-bus', label: 'Event Bus', icon: <Radio size={16} /> },
  { page: 'lab', label: 'Lab', icon: <Gauge size={16} /> },
];

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
        background: 'var(--sidebar-input)',
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
  const collapsed = useFrameStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useFrameStore((s) => s.toggleSidebarCollapsed);
  const showDeveloperTools = useFrameStore((s) => s.showDeveloperTools);
  const setShowDeveloperTools = useFrameStore((s) => s.setShowDeveloperTools);
  const [location] = useLocation();
  const activePage = pageForPath(location);
  const setActivePage = useFrameStore((s) => s.setActivePage);

  // Preserve native modified clicks/new tabs; ordinary clicks stay within the app.
  const followPage = (event: MouseEvent<HTMLAnchorElement>, page: AppPage) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setActivePage(page);
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null);

  const handleCreate = () => {
    // If the user creates a dashboard while the sidebar is collapsed,
    // there's no rename input visible to type into. Auto-expand so the
    // user actually sees the inline rename appear.
    if (collapsed) toggleCollapsed();
    const nd = createDashboard('Untitled Dashboard');
    setActivePage('dashboard');
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

  const renderNavItem = ({ page, label, icon, partial = false }: {
    page: AppPage; label: string; icon: React.ReactNode; partial?: boolean;
  }) => (
    <a
      key={page}
      href={PAGE_PATHS[page]}
      data-testid={`nav-${page}`}
      data-nav-page={page}
      className={`dash-item mvp-nav-item${activePage === page ? ' active' : ''}`}
      aria-label={label}
      title={collapsed ? label : undefined}
      aria-current={activePage === page ? 'page' : undefined}
      onClick={(event) => followPage(event, page)}
    >
      <span className="dash-marker" aria-hidden="true">{icon}</span>
      {!collapsed && <span className="dash-name">{label}</span>}
      {!collapsed && partial && <span className="local-nav-chip">partial</span>}
    </a>
  );

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Brand block. OmniNode icon on the left, OmniDash product label
          on the right (kept per client direction — branding guideline
          covers logo + font only, OmniDash text stays). */}
      <div className="brand">
        <img
          src="/brand/logo-icon.svg"
          alt="OmniNode"
          className="brand-mark"
        />
        {!collapsed && (
          <div className="brand-name">
            <span className="primary">
              Omni<em>Dash</em>
            </span>
            <span className="parent">an omninode product</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>

      {/* OMN-19981 Amendment 6 (requirements FR-3): the six local pages, in the required order, first in the
          sidebar. A page whose exposure is not served yet carries a "partial" chip; clicking an open page keeps it. */}
      <nav aria-label="Local" className="local-nav">
        {!collapsed && (
          <div className="sidebar-bottom-title" style={{ padding: '4px 12px 2px' }}>
            <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">
              Local
            </Text>
          </div>
        )}
        {LOCAL_PAGES.map(renderNavItem)}
      </nav>

      {SHOW_CUSTOM_DASHBOARDS && <>
      {/* Section header */}
      <div className="nav-section">
        {!collapsed && <span className="nav-section-title">Dashboards</span>}
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
          const isActive = activePage === 'dashboard' && d.id === activeDashboardId;
          return (
            <div
              key={d.id}
              data-testid={`dash-item-${d.id}`}
              className={`dash-item${isActive ? ' active' : ''}`}
              onClick={() => { setActiveDashboardById(d.id); setActivePage('dashboard'); }}
              // Show the dashboard name on hover when the sidebar is
              // collapsed — otherwise users have no way to read it.
              title={collapsed ? d.name : undefined}
            >
              {/* Marker */}
              <span className="dash-marker">
                {isActive ? '▸' : String(i + 1).padStart(2, '0')}
              </span>

              {/* Name or inline rename — hidden when collapsed. */}
              {!collapsed && (renamingId === d.id ? (
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
              ))}

              {/* Kebab menu (PositionedMenu — prototype pattern). Hidden
                  when collapsed; rename / duplicate / delete are still
                  reachable after expanding. */}
              {!collapsed && (
                <DashboardKebab
                  dashboardName={d.name}
                  onRename={() => setRenamingId(d.id)}
                  onDuplicate={() => duplicateDashboard(d.id)}
                  onDelete={() => setPendingDeletionId(d.id)}
                />
              )}
            </div>
          );
        })}

        {dashboards.length === 0 && !collapsed && (
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

      </>}

      <nav aria-label="Evidence" className="local-nav evidence-nav">
        {!collapsed && <div className="mvp-nav-title"><Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Evidence</Text></div>}
        {renderNavItem({ page: 'delegation-evidence', label: 'Delegation Evidence', icon: <BadgeCheck size={16} /> })}
      </nav>

      {showDeveloperTools && (
        <nav id="developer-navigation" aria-label="Developer" className="local-nav developer-nav">
          {!collapsed && <div className="mvp-nav-title"><Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Developer</Text></div>}
          {DEVELOPER_PAGES.map(renderNavItem)}
        </nav>
      )}

      <div className="sidebar-settings">
        <button
          type="button"
          role="checkbox"
          aria-label="Show developer tools"
          aria-checked={showDeveloperTools}
          aria-controls={showDeveloperTools ? 'developer-navigation' : undefined}
          title="Show developer tools"
          className="developer-toggle"
          onClick={() => setShowDeveloperTools(!showDeveloperTools)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {!collapsed && <><span>Show developer tools</span><span className="developer-switch" aria-hidden="true" /></>}
        </button>
      </div>

      <DeleteDashboardDialog
        dashboardName={
          pendingDeletionId
            ? (dashboards.find((d) => d.id === pendingDeletionId)?.name ?? null)
            : null
        }
        onConfirm={() => {
          if (pendingDeletionId) deleteDashboard(pendingDeletionId);
          setPendingDeletionId(null);
        }}
        onCancel={() => setPendingDeletionId(null)}
      />
    </aside>
  );
}

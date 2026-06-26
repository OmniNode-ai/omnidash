// SOURCE: Claude Design prototype
//   React:   src/app.jsx:339-422
//   Styling: OmniDash.html:93-240
// Deviations from source:
//   - OMN-47: CSS ported verbatim to src/styles/sidebar.css; TSX rewritten to use prototype class names.
//   - Post-OMN-48: "Platform Eng" workspace chip removed — it was static markup with no behavior
//     wired, and the product has no workspaces concept yet.
//   - OMN-13602 (green-field strip): the multi-dashboard list manager (create / rename /
//     duplicate / delete, the kebab menu, the delete dialog) was removed along with the
//     widget builder. The product now has one fixed dashboard, so the left nav is a single
//     static "Dashboard" entry above the operator-tool groups.

import { ChevronsLeft, ChevronsRight, SlidersHorizontal, Grid3x3, GitBranch, Sparkles, FlaskConical, Radio, LayoutDashboard } from 'lucide-react';
import type { AppPage } from '@/store/types';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';

export function Sidebar() {
  const collapsed = useFrameStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useFrameStore((s) => s.toggleSidebarCollapsed);
  const activePage = useFrameStore((s) => s.activePage);
  const setActivePage = useFrameStore((s) => s.setActivePage);

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

      {/* OMN-13602 — single fixed dashboard, the default `dashboard` route.
          A plain container, NOT the old `.dash-list` (which used flex:1 to fill
          the rail and pushed the tool groups to the bottom of the column). */}
      <div className="nav-group">
        <div
          role="button"
          tabIndex={0}
          data-testid="nav-dashboard"
          className={`dash-item${activePage === 'dashboard' ? ' active' : ''}`}
          title={collapsed ? 'Dashboard' : undefined}
          onClick={() => setActivePage('dashboard')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setActivePage('dashboard');
          }}
        >
          <span className="dash-marker"><LayoutDashboard size={13} /></span>
          {!collapsed && <span className="dash-name">Dashboard</span>}
        </div>
      </div>

      {/* Event-driven runtime nav group — the four ported views
          (delegation-evidence / event-bus / experiments / sea-control). Stacks
          directly under Dashboard, per the dashboard-with-tools-nav wireframe. */}
      <div className="nav-group">
        {!collapsed && (
          <div className="sidebar-bottom-title">
            <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">
              Event-driven runtime
            </Text>
          </div>
        )}
        {(
          [
            { page: 'delegation-evidence' as AppPage, label: 'Delegation Evidence', icon: <GitBranch size={13} /> },
            { page: 'event-bus' as AppPage, label: 'Event Bus', icon: <Radio size={13} /> },
            { page: 'experiments' as AppPage, label: 'Experimentation', icon: <FlaskConical size={13} /> },
            { page: 'sea-control' as AppPage, label: 'SEA Control Plane', icon: <Sparkles size={13} /> },
          ] as const
        ).map(({ page, label, icon }) => (
          <div
            key={page}
            role="button"
            tabIndex={0}
            data-testid={`nav-${page}`}
            className={`dash-item${activePage === page ? ' active' : ''}`}
            title={collapsed ? label : undefined}
            onClick={() => setActivePage(activePage === page ? 'dashboard' : page)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setActivePage(activePage === page ? 'dashboard' : page);
              }
            }}
          >
            <span className="dash-marker">{icon}</span>
            {!collapsed && <span className="dash-name">{label}</span>}
          </div>
        ))}
      </div>

      {/* Evaluation tools / feature flags — contiguous with the group above,
          per the wireframe (no longer pinned to the bottom of the rail). */}
      <div className="nav-group">
        {!collapsed && (
          <div className="sidebar-bottom-title">
            <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">
              Evaluation
            </Text>
          </div>
        )}
        {(
          [
            { page: 'eval'    as AppPage, label: 'Instruction Eval', icon: <Grid3x3 size={13} /> },
          ] as const
        ).map(({ page, label, icon }) => (
          <div
            key={page}
            role="button"
            tabIndex={0}
            className={`dash-item${activePage === page ? ' active' : ''}`}
            title={collapsed ? label : undefined}
            onClick={() => setActivePage(activePage === page ? 'dashboard' : page)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setActivePage(activePage === page ? 'dashboard' : page);
              }
            }}
          >
            <span className="dash-marker">{icon}</span>
            {!collapsed && <span className="dash-name">{label}</span>}
          </div>
        ))}

        <div
          role="button"
          tabIndex={0}
          className={`dash-item${activePage === 'feature-flags' ? ' active' : ''}`}
          title={collapsed ? 'Feature Flags' : undefined}
          onClick={() => setActivePage(activePage === 'feature-flags' ? 'dashboard' : 'feature-flags')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActivePage(activePage === 'feature-flags' ? 'dashboard' : 'feature-flags');
            }
          }}
        >
          <span className="dash-marker">
            <SlidersHorizontal size={13} />
          </span>
          {!collapsed && (
            <span className="dash-name">Feature Flags</span>
          )}
        </div>
      </div>
    </aside>
  );
}

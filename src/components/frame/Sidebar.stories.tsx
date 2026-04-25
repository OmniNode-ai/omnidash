// Storybook coverage for Sidebar — the dashboard list rail with
// brand block, "+ new" affordance, per-row kebab menus, and inline
// rename. Sidebar reads `dashboards` and `activeDashboardId` from the
// real Zustand store, so each story seeds the store via
// `useFrameStore.setState({...})` rather than mocking the hook.
//
// Mirrors the DateRangeSelector pattern (OMN-114): a per-story
// `seedStoreDecorator(...)` reaches through the store API directly so
// stories don't drift when the store shape changes.
//
// Stories cover four visible states:
//   - `EmptyList` (Empty alias): no dashboards → renders the
//     "No dashboards yet" empty-state CTA.
//   - `Populated`: a fixture list of 4 dashboards with the second one
//     active — exercises the active-marker (`▸`), the inactive
//     numeric prefix (`02`, `03`, ...), and the per-row kebab buttons.
//   - `SingleDashboard`: edge case — exactly one dashboard, active.
//     Verifies the list still renders correctly when there is no
//     "next" item to highlight a transition.
//   - `Renaming`: simulates a double-click on the second dashboard's
//     name on mount via the same effect-driven DOM-dispatch pattern
//     `ComponentPalette.stories.tsx` uses for its search prefill, so
//     reviewers see the inline `RenameInput` directly without having
//     to interact. Covers the rename interaction per OMN-121.
import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar } from './Sidebar';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { useFrameStore } from '@/store/store';
import type { DashboardDefinition } from '@shared/types/dashboard';

// Pinned timestamps so screenshots stay stable.
const FIXED_NOW = '2026-04-24T00:00:00.000Z';

function makeDashboard(id: string, name: string): DashboardDefinition {
  return {
    id,
    schemaVersion: '1.0',
    name,
    layout: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    author: 'storybook',
    shared: false,
  };
}

const FIXTURE_DASHBOARDS: DashboardDefinition[] = [
  makeDashboard('dash-1', 'Platform Overview'),
  makeDashboard('dash-2', 'Cost Analytics'),
  makeDashboard('dash-3', 'Routing Decisions'),
  makeDashboard('dash-4', 'Quality Gates'),
];

// Per-story decorator that seeds (or clears) the dashboard list and
// active id in the real store before each render. Re-runs on every
// render so navigating between stories in the sidebar resets state.
const seedStoreDecorator = (
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
) => (Story: () => React.ReactElement) => {
  useFrameStore.setState({ dashboards, activeDashboardId });
  return <Story />;
};

const meta: Meta<typeof Sidebar> = {
  title: 'Frame / Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  // Sidebar is `position: fixed`-style chrome that sets its own
  // 240px width via the prototype `.sidebar` CSS class. Render in a
  // 240×600 wrapper so the story canvas frames it accurately.
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 600, position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Sidebar>;

// ----- EmptyList (Empty alias) ---------------------------------------
//
// No dashboards in the store → empty-state CTA renders with the
// "Create your first one →" link. Compliance anchor.
export const EmptyList: Story = {
  decorators: [seedStoreDecorator([], null), makeDashboardDecorator({})],
};
export const Empty = EmptyList;

// ----- Populated -----------------------------------------------------
//
// 4 dashboards, second one (`dash-2`) active so reviewers can see
// both the active marker (`▸`) and inactive numeric markers
// (`01`, `03`, `04`) at the same time. Compliance anchor.
export const Populated: Story = {
  decorators: [
    seedStoreDecorator(FIXTURE_DASHBOARDS, 'dash-2'),
    makeDashboardDecorator({}),
  ],
};

// ----- SingleDashboard -----------------------------------------------
//
// One dashboard, active. Edge case for "single-row list" rendering.
export const SingleDashboard: Story = {
  decorators: [
    seedStoreDecorator([FIXTURE_DASHBOARDS[0]], 'dash-1'),
    makeDashboardDecorator({}),
  ],
};

// ----- Renaming ------------------------------------------------------
//
// Sidebar's inline rename mode is local component state
// (`renamingId`) that the user enters by either double-clicking the
// `.dash-name` span or selecting "Rename" from the kebab. Neither
// path is reachable from the store, so this story renders a wrapper
// that finds the second dashboard's name on mount and dispatches a
// real `dblclick` event against it — same imperative recipe
// `ComponentPalette.stories.tsx` uses to prefill its search input.
//
// On render, dash-2's row swaps the `<span class="dash-name">` for
// the focused `<input>` from `RenameInput`, with the dashboard name
// pre-selected. Pressing Enter commits via `renameDashboard()`,
// Escape cancels — both branches reachable via interaction in the
// canvas.
function SidebarRenamingDash2() {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      '[data-testid="dash-item-dash-2"] .dash-name',
    );
    if (!target) return;
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }, []);
  return (
    <div ref={containerRef}>
      <Sidebar />
    </div>
  );
}

export const Renaming: Story = {
  render: () => <SidebarRenamingDash2 />,
  decorators: [
    seedStoreDecorator(FIXTURE_DASHBOARDS, 'dash-1'),
    makeDashboardDecorator({}),
  ],
};

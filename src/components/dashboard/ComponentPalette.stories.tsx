// Storybook coverage for ComponentPalette — the widget library rail
// shown in edit mode. The palette is presentational over its
// `components` prop (the registry list), so stories drive every
// branch via inline mock data instead of seeding a query cache.
//
// `Default`/`Populated` exercise the "happy path": multiple
// categories, one disabled card to verify the not-implemented
// affordance. `Searching` pre-fills the search input via an initial
// state seed (rendered through a wrapper that owns the query) — but
// since the component owns its own search state internally, we
// instead exercise the search code path by passing a single component
// that matches a canonical query and watching the categories collapse
// to a single section. `NoMatches`/`Empty` cover the empty-state
// fallback ("No widgets match...") and the truly-empty `components`
// list respectively. The compliance grep at
// `src/storybook-coverage-compliance.test.ts` requires `Empty` and
// `Populated` exports verbatim.
//
// Mock entries are defined inline (this is a one-off per task recipe —
// no shared fixture). Each entry conforms to `RegisteredComponent` so
// the prop types match without casts.
import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ComponentPalette } from './ComponentPalette';
import type { RegisteredComponent } from '@/registry/types';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

// ----- Inline mock registry list -----------------------------------
//
// Six entries spanning four of the five categories so the rail shows
// multiple group headers in `Default`. One entry (`legacy-status`) is
// `not_implemented` to exercise the disabled-card / dashed outline
// branch. Manifests are minimal but type-complete; fields not read by
// the palette (configSchema, dataSources, events, sizes, capabilities)
// use neutral defaults rather than realistic values.

const baseManifestExtras = {
  version: '1.0.0',
  configSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
  dataSources: [],
  events: { emits: [], consumes: [] },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 4, h: 3 },
  maxSize: { w: 12, h: 8 },
  emptyState: { message: 'No data' },
  capabilities: {
    supports_compare: false,
    supports_export: false,
    supports_fullscreen: false,
  },
};

const mockComponents: RegisteredComponent[] = [
  {
    name: 'cost-trend-panel',
    status: 'available',
    manifest: {
      ...baseManifestExtras,
      name: 'cost-trend-panel',
      displayName: 'Cost Trend',
      description: 'LLM cost trends and token usage over time',
      category: 'quality',
      implementationKey: 'cost-trend/CostTrendPanel',
    },
  },
  {
    name: 'delegation-metrics',
    status: 'available',
    manifest: {
      ...baseManifestExtras,
      name: 'delegation-metrics',
      displayName: 'Delegation Metrics',
      description: 'Task delegation events and quality gate pass rates',
      category: 'quality',
      implementationKey: 'delegation/DelegationMetrics',
    },
  },
  {
    name: 'cost-by-model',
    status: 'available',
    manifest: {
      ...baseManifestExtras,
      name: 'cost-by-model',
      displayName: 'Cost by Model',
      description: 'Pie chart of LLM cost share per model',
      category: 'cost',
      implementationKey: 'cost-by-model/CostByModelPie',
    },
  },
  {
    name: 'routing-decision-table',
    status: 'available',
    manifest: {
      ...baseManifestExtras,
      name: 'routing-decision-table',
      displayName: 'Routing Decisions',
      description: 'LLM routing decision log with agreement rates',
      category: 'activity',
      implementationKey: 'routing/RoutingDecisionTable',
    },
  },
  {
    name: 'event-stream',
    status: 'available',
    manifest: {
      ...baseManifestExtras,
      name: 'event-stream',
      displayName: 'Event Stream',
      description: 'Live feed of platform events',
      category: 'activity',
      implementationKey: 'events/EventStream',
    },
  },
  {
    name: 'legacy-status',
    status: 'not_implemented',
    manifest: {
      ...baseManifestExtras,
      name: 'legacy-status',
      displayName: 'Legacy Status',
      description: 'Placeholder for an older status panel (not wired up)',
      category: 'health',
      implementationKey: 'status/LegacyStatus',
    },
  },
];

// ----- Search-prefill helper ----------------------------------------
//
// `ComponentPalette` owns its search query in `useState` with no prop
// to seed it, so `Searching` and `NoMatches` would render the empty
// search input by default. To make those stories meaningfully
// exercise the search code path on first paint, this wrapper finds
// the rail's input on mount and dispatches a native input event with
// the desired query. Storybook's a11y/test harness sees the resulting
// filtered DOM.
function PaletteWithSearch({
  query,
  components,
  onAddComponent,
}: {
  query: string;
  components: RegisteredComponent[];
  onAddComponent: (name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = containerRef.current?.querySelector<HTMLInputElement>(
      'input[aria-label="Search widgets"]',
    );
    if (!input) return;
    // Trigger React's synthetic onChange by writing through the
    // native value setter and dispatching `input` — the standard
    // jsdom-friendly recipe.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, [query]);
  return (
    <div ref={containerRef}>
      <ComponentPalette components={components} onAddComponent={onAddComponent} />
    </div>
  );
}

const meta: Meta<typeof ComponentPalette> = {
  title: 'Dashboard / ComponentPalette',
  component: ComponentPalette,
  parameters: { layout: 'fullscreen' },
  // The palette renders no data-driven children, but
  // `makeDashboardDecorator` keeps the QueryClient + ThemeProvider
  // contexts consistent with every other dashboard story so any
  // future child that joins the tree (e.g. tooltips reading theme
  // tokens) keeps working without per-story updates.
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj<typeof ComponentPalette>;

// ----- Default ------------------------------------------------------
//
// Full mock list, no search query — renders multiple category headers
// and one disabled card. This is the canonical "happy path" view.

export const Default: Story = {
  args: {
    components: mockComponents,
    onAddComponent: fn(),
  },
};

// ----- Searching ----------------------------------------------------
//
// Pre-fills the search input with "cost" so only the two cost-themed
// widgets remain visible — verifies the search filter, the
// description-match path (the entries match on both displayName and
// description), and that empty category groups collapse rather than
// rendering a blank header.

export const Searching: Story = {
  render: () => (
    <PaletteWithSearch query="cost" components={mockComponents} onAddComponent={fn()} />
  ),
};

// ----- NoMatches ----------------------------------------------------
//
// Search query that nothing matches — exercises the
// `filtered.length === 0` empty-state branch ("No widgets match
// '<query>'"). The footer count still reflects the underlying
// `components.length`, which is intentional: the count is "available
// in the registry", not "currently visible".

export const NoMatches: Story = {
  render: () => (
    <PaletteWithSearch
      query="zzzz-nonexistent-widget"
      components={mockComponents}
      onAddComponent={fn()}
    />
  ),
};

// ----- Empty --------------------------------------------------------
//
// Compliance anchor (`/export\s+const\s+Empty\s*[:=]/` — see
// `src/storybook-coverage-compliance.test.ts`). Renders the palette
// with an empty `components` array — no category headers, no cards,
// and the footer reads "0 widgets available". Distinct from
// `NoMatches` because the empty-state copy ("No widgets match...")
// is keyed off the *filter* result, and an empty input + empty list
// short-circuits to "no groups, no fallback message" — a separate
// edge case worth covering.

export const Empty: Story = {
  args: {
    components: [],
    onAddComponent: fn(),
  },
};

// ----- Populated ----------------------------------------------------
//
// Compliance anchor for the data-rendered branch. Aliased to
// `Default` because the palette has no separate "data loaded vs
// data fetching" rendering — its single rendering branch is the
// populated list.

export const Populated: Story = Default;

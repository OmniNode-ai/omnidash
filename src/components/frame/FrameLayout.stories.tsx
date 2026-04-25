// Storybook coverage for FrameLayout — the application shell that
// composes Sidebar + main content area. FrameLayout has no state of
// its own; it's a structural wrapper. Stories therefore exercise the
// composition rather than data branches, with the Sidebar populated
// via the same Zustand-store seeding pattern Sidebar.stories.tsx
// uses.
//
// `Empty` renders the shell with an empty Sidebar and a placeholder
// empty main panel — the cold-start view a user sees on first launch.
// `Populated` renders the shell with several seeded dashboards in the
// Sidebar and a fake widget grid in the main panel — the canonical
// "app is in use" view.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FrameLayout } from './FrameLayout';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { useFrameStore } from '@/store/store';
import { Text } from '@/components/ui/typography';
import type { DashboardDefinition } from '@shared/types/dashboard';

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
];

const seedStoreDecorator = (
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
) => (Story: () => React.ReactElement) => {
  useFrameStore.setState({ dashboards, activeDashboardId });
  return <Story />;
};

// Static placeholder for the main panel. Two paragraphs of muted
// copy give reviewers a sense of how content sits inside the
// `.main` slot of the prototype CSS without dragging in a live
// DashboardView (which has its own routing + persistence concerns).
function MainPlaceholder({ heading }: { heading: string }) {
  return (
    <div style={{ padding: 24 }}>
      <Text as="h1" size="xl" weight="semibold" style={{ margin: 0 }}>
        {heading}
      </Text>
      <Text as="p" size="md" color="secondary" style={{ marginTop: 12 }}>
        Main content area. In the running app this renders DashboardView
        with the active dashboard's grid.
      </Text>
    </div>
  );
}

const meta: Meta<typeof FrameLayout> = {
  title: 'Frame / FrameLayout',
  component: FrameLayout,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof FrameLayout>;

// ----- Empty ---------------------------------------------------------
//
// Sidebar shows the empty-state CTA, main panel shows a "Welcome"
// placeholder. Compliance anchor.
export const Empty: Story = {
  render: () => (
    <FrameLayout>
      <MainPlaceholder heading="Welcome to OmniDash" />
    </FrameLayout>
  ),
  decorators: [seedStoreDecorator([], null), makeDashboardDecorator({})],
};

// ----- Populated -----------------------------------------------------
//
// Sidebar with 3 dashboards, first active. Main panel labels the
// active dashboard. Canonical happy-path render. Compliance anchor.
export const Populated: Story = {
  render: () => (
    <FrameLayout>
      <MainPlaceholder heading="Platform Overview" />
    </FrameLayout>
  ),
  decorators: [
    seedStoreDecorator(FIXTURE_DASHBOARDS, 'dash-1'),
    makeDashboardDecorator({}),
  ],
};

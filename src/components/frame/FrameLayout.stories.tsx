// Storybook coverage for FrameLayout (OMN-13602) — the application shell that
// composes the trimmed Sidebar + main content area. FrameLayout has no state of
// its own; it's a structural wrapper, so the stories exercise the composition
// (expanded vs collapsed rail) rather than data branches.
import type { Meta, StoryObj, Decorator } from '@storybook/react-vite';
import { FrameLayout } from './FrameLayout';
import { useFrameStore } from '@/store/store';
import { Text } from '@/components/ui/typography';

const seedDecorator = (collapsed: boolean): Decorator => (Story) => {
  useFrameStore.setState({ activePage: 'dashboard', sidebarCollapsed: collapsed });
  return <Story />;
};

// Static placeholder for the main panel so reviewers see how content sits inside
// the `.main` slot without dragging in the live dashboard page.
function MainPlaceholder({ heading }: { heading: string }) {
  return (
    <div style={{ padding: 24 }}>
      <Text as="h1" size="xl" weight="semibold" style={{ margin: 0 }}>
        {heading}
      </Text>
      <Text as="p" size="md" color="secondary" style={{ marginTop: 12 }}>
        Main content area. In the running app this renders the dashboard.
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

// Expanded rail + main placeholder. Compliance anchor.
export const Empty: Story = {
  render: () => (
    <FrameLayout>
      <MainPlaceholder heading="Welcome to OmniDash" />
    </FrameLayout>
  ),
  decorators: [seedDecorator(false)],
};

// Collapsed rail + main placeholder. Compliance anchor.
export const Populated: Story = {
  render: () => (
    <FrameLayout>
      <MainPlaceholder heading="Dashboard" />
    </FrameLayout>
  ),
  decorators: [seedDecorator(true)],
};

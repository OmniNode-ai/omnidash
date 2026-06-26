// Storybook coverage for the trimmed Sidebar (OMN-13602): one fixed "Dashboard"
// entry plus the operator-tool nav groups. The multi-dashboard list, per-row
// kebab menus, and inline rename were removed with the widget builder, so the
// stories now cover the expanded vs collapsed rail. The Sidebar reads only the
// global store, so no dashboard-context decorator is needed.
import type { Meta, StoryObj, Decorator } from '@storybook/react-vite';
import { Sidebar } from './Sidebar';
import { useFrameStore } from '@/store/store';

const seedDecorator = (collapsed: boolean): Decorator => (Story) => {
  useFrameStore.setState({ activePage: 'dashboard', sidebarCollapsed: collapsed });
  return <Story />;
};

const meta: Meta<typeof Sidebar> = {
  title: 'Frame / Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  // Sidebar sets its own 240px width via the prototype `.sidebar` CSS class.
  // Render in a 240×600 wrapper so the story canvas frames it accurately.
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

// Expanded rail — the default view with labels. Compliance anchor.
export const Empty: Story = {
  decorators: [seedDecorator(false)],
};

// Collapsed rail — icons only. Compliance anchor.
export const Populated: Story = {
  decorators: [seedDecorator(true)],
};

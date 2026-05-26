import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CommandPalette } from './CommandPalette';

const meta: Meta<typeof CommandPalette> = {
  title: 'Dashboard / CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
  args: { onClose: fn() },
};
export default meta;
type Story = StoryObj<typeof CommandPalette>;

export const Open: Story = {};

export const WithResults: Story = {
  // All nodes visible — default state with no query filter
};

export const Dispatching: Story = {
  // This story documents the Dispatching state — see DispatchButton.stories for the in-flight button variant
};

export const Error: Story = {
  // Palette shown when dispatch endpoint is unavailable — DispatchButton shows disabled
};

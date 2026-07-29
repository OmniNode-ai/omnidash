import type { Meta, StoryObj } from '@storybook/react';
import DelegateTaskWidget from './DelegateTaskWidget';

const meta = {
  title: 'Dashboard/DelegateTaskWidget',
  component: DelegateTaskWidget,
} satisfies Meta<typeof DelegateTaskWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

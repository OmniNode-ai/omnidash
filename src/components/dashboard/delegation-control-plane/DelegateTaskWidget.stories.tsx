import type { Meta, StoryObj } from '@storybook/react';
import DelegateTaskWidget from './DelegateTaskWidget';

const meta = {
  title: 'Dashboard/DelegateTaskWidget',
  component: DelegateTaskWidget,
} satisfies Meta<typeof DelegateTaskWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { config: {} },
};

export const Populated: Story = {
  args: {
    config: {
      initialPrompt: 'Review the payment workflow and return its failing correlation IDs.',
    },
  },
};

export const Default: Story = Empty;

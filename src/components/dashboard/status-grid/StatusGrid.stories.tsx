import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusGrid } from './StatusGrid';
import { SEED_ENVIRONMENT_ROWS, SEED_ENVIRONMENT_TOPIC } from './seed-rows';

/**
 * OMN-19993: the Services status grid over the seeded OV-2 roster (every severity present), and its
 * empty state naming the topic it waits on. The render check screenshots Seeded in color and in grayscale.
 */
const meta: Meta<typeof StatusGrid> = {
  title: 'Dashboard/StatusGrid',
  component: StatusGrid,
  args: { title: 'Services', waitsOn: [SEED_ENVIRONMENT_TOPIC], fileMode: true },
};

export default meta;
type Story = StoryObj<typeof StatusGrid>;

export const Seeded: Story = {
  args: { rows: SEED_ENVIRONMENT_ROWS },
};

export const WaitingForTopic: Story = {
  args: { rows: [] },
};

/** A row with no reason is refused and named, never drawn. */
export const RowWithoutReason: Story = {
  args: {
    rows: [...SEED_ENVIRONMENT_ROWS.slice(0, 3), { ...SEED_ENVIRONMENT_ROWS[6]!, key: 'ghost', label: 'ghost', status_reason: '' }],
  },
};

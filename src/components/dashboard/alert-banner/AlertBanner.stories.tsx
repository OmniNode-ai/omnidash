import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertBanner } from './AlertBanner';
import { SEED_ALERT_ROWS, SEED_ALERTS_TOPIC } from '../status-grid/seed-rows';

/**
 * OMN-19993: the open-alerts banner over the seeded OV-6 alerts (one critical banner, the rest collapsed),
 * and its positive "All clear" empty state. The render check screenshots Seeded in color and in grayscale.
 */
const meta: Meta<typeof AlertBanner> = {
  title: 'Dashboard/AlertBanner',
  component: AlertBanner,
  args: { waitsOn: [SEED_ALERTS_TOPIC] },
};

export default meta;
type Story = StoryObj<typeof AlertBanner>;

export const Seeded: Story = {
  args: { alerts: SEED_ALERT_ROWS },
};

export const AllClear: Story = {
  args: { alerts: [] },
};

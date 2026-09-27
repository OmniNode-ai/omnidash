import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionGraphRendererComparison } from './ExecutionGraphRendererComparison';
import { historicalTopologyWithSyntheticWatermarks } from './__fixtures__/historicalTopologyWithSyntheticWatermarks';

// Both adapters see the same historical topology and synthetic watermark
// fixture; neither may claim these cursor bounds were captured from the lab.
const realFiveHopGraph = historicalTopologyWithSyntheticWatermarks;

const meta = {
  title: 'Delegation/Execution Graph Renderer Comparison',
  component: ExecutionGraphRendererComparison,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => <div style={{ margin: 24, maxWidth: 2400 }}>
      <p role="note">Historical five-hop topology; ingest watermarks are synthetic fixture values, not captured run evidence.</p>
      <Story />
    </div>,
  ],
} satisfies Meta<typeof ExecutionGraphRendererComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Same historical-topology fixture is passed to both adapters. */
export const RealFiveHop: Story = { args: { graph: realFiveHopGraph } };

import type { Meta, StoryObj } from '@storybook/react';
import type { ModelExecutionGraph } from './render-model';
import { ExecutionGraphRendererComparison } from './ExecutionGraphRendererComparison';
import realFiveHopGraphJson from './__fixtures__/realFiveHopGraph.json';

// Exact serialized result from the reconciled Core fold. This type assertion
// adds no defaults, transformations, or synthetic graph semantics.
const realFiveHopGraph = realFiveHopGraphJson as unknown as ModelExecutionGraph;

const meta = {
  title: 'Delegation/Execution Graph Renderer Comparison',
  component: ExecutionGraphRendererComparison,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => <div style={{ margin: 24, maxWidth: 2400 }}><Story /></div>,
  ],
} satisfies Meta<typeof ExecutionGraphRendererComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Same real folded ModelExecutionGraph instance is passed to both adapters. */
export const RealFiveHop: Story = { args: { graph: realFiveHopGraph } };

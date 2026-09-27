import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionGraphView } from './ExecutionGraphView';
import {
  ExecutionGraphTransportProvider,
  type ExecutionGraphTransport,
} from './ExecutionGraphTransport';
import type { ModelExecutionGraph } from './render-model';
import { endpointNodeId } from './render-model';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';
import realFiveHopGraphJson from './__fixtures__/realFiveHopGraph.json';

const realFiveHopGraph = realFiveHopGraphJson as unknown as ModelExecutionGraph;

// UI assertion fixture only: preserve the real fold output and attach one
// deliberately conflicting current stored annotation to exercise comparison.
const storedGradeDisagreementFixture: ModelExecutionGraph = {
  ...realFiveHopGraph,
  annotations: {
    ...realFiveHopGraph.annotations,
    stored_chain: [
      {
        node_id: 'd88c5031-0da9-462a-80ef-8cc817934cc6',
        hop_index: 1,
        replay_green: false,
        verifier_verdict: 'fail',
      },
    ],
  },
};

const mixedStatusFixture: ModelExecutionGraph = {
  ...realFiveHopGraph,
  replay: {
    ...realFiveHopGraph.replay,
    nodes: realFiveHopGraph.replay.nodes.map((node, index) =>
      index === 1
        ? { ...node, replay_green: false, verifier_verdict: 'fail' }
        : index === 2
          ? { ...node, replay_green: null, verifier_verdict: null }
          : node,
    ),
  },
};

// Explicit Storybook-only earlier-bound fixture, derived from the same fold
// nodes. These records exercise rendering transitions, not cursor semantics.
const earlierNodeIds = new Set(mixedStatusFixture.replay.order.slice(0, 3));
const earlierNodes = mixedStatusFixture.replay.nodes.filter((node) => earlierNodeIds.has(node.id));
const earlierBounds = new Map<string, number>();
for (const node of earlierNodes) {
  const key = `${node.topic}\u0000${node.partition}`;
  earlierBounds.set(key, Math.max(earlierBounds.get(key) ?? -1, node.kafka_offset));
}
const earlierBoundFixture: ModelExecutionGraph = {
  ...mixedStatusFixture,
  replay: {
    ...mixedStatusFixture.replay,
    nodes: earlierNodes,
    edges: mixedStatusFixture.replay.edges.filter((edge) => {
      const from = endpointNodeId(edge.from_id);
      const to = endpointNodeId(edge.to_id);
      return from !== null && to !== null && earlierNodeIds.has(from) && earlierNodeIds.has(to);
    }),
    order: mixedStatusFixture.replay.order.filter((id) => earlierNodeIds.has(id)),
    source_cursors: [...earlierBounds.entries()].map(([key, max_kafka_offset]) => {
      const [topic, partition] = key.split('\u0000');
      return { topic, partition: Number(partition), max_kafka_offset };
    }),
  },
  labels: mixedStatusFixture.labels.filter((label) => earlierNodeIds.has(label.node_id)),
};

const fixturePlaybackTransport: ExecutionGraphTransport = {
  readLatest: async () => mixedStatusFixture,
  step: async (_correlationId, _currentCursors, direction) =>
    direction === 'previous' ? earlierBoundFixture : mixedStatusFixture,
};

const laterGraph = {
  ...provisionalExecutionGraph,
  replay: {
    ...provisionalExecutionGraph.replay,
    source_cursors: [{ ...provisionalExecutionGraph.replay.source_cursors[0], max_kafka_offset: 43 }],
  },
};

const meta = {
  title: 'Delegation/Execution Graph View',
  component: ExecutionGraphView,
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => provisionalExecutionGraph,
        step: async (_correlationId, _currentCursors, direction) => direction === 'next' ? laterGraph : null,
      }}>
        <div style={{ margin: 24, maxWidth: 1000 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
} satisfies Meta<typeof ExecutionGraphView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Test/story input only; replace with a real core-fold fixture before visual sign-off. */
export const Provisional: Story = { args: { correlationId: 'corr-provisional-001' } };

/** Render the exact Core fold fixture; this transport exposes no adjacent bounds. */
export const RealFiveHopFixture: Story = {
  args: { correlationId: realFiveHopGraph.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => realFiveHopGraph,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

/** Synthetic stored-grade annotation against unchanged fold output; not lab evidence. */
export const StoredGradeDisagreementFixture: Story = {
  args: { correlationId: storedGradeDisagreementFixture.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => storedGradeDisagreementFixture,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

/** Mixed statuses and adjacent bounds are deterministic browser-test fixtures only. */
export const StatusAndPlaybackFixture: Story = {
  args: { correlationId: mixedStatusFixture.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={fixturePlaybackTransport}>
        <div style={{ margin: 24, maxWidth: 1400 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

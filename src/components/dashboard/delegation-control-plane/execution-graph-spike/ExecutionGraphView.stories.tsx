import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionGraphView } from './ExecutionGraphView';
import {
  ExecutionGraphTransportProvider,
  type ExecutionGraphTransport,
} from './ExecutionGraphTransport';
import type { ModelExecutionGraph } from './render-model';
import { endpointNodeId } from './render-model';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';
import { historicalTopologyWithSyntheticWatermarks } from './__fixtures__/historicalTopologyWithSyntheticWatermarks';

const realFiveHopGraph = historicalTopologyWithSyntheticWatermarks;

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

const unresolvedAndWithheldFixture: ModelExecutionGraph = {
  ...realFiveHopGraph,
  replay: {
    ...realFiveHopGraph.replay,
    unresolved: [
      {
        subject_id: '00000000-0000-4000-8000-000000000001',
        reason: 'missing_parent',
        source_ref: realFiveHopGraph.replay.nodes[1].source_ref,
      },
    ],
    withheld_count: 2,
  },
};

// Synthetic labels exercise timestamp presentation. Historical versions are
// preserved, but the watermark bounds are synthetic.
const projectionDetailFieldsFixture: ModelExecutionGraph = {
  ...realFiveHopGraph,
  labels: realFiveHopGraph.labels.map((label) =>
    label.node_id === realFiveHopGraph.replay.nodes[1].id
      ? {
          ...label,
          event_timestamp: '2026-09-26T12:00:00Z',
          ledger_written_at: '2026-09-26T12:00:01Z',
        }
      : label,
  ),
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
const earlierKeys = new Set(earlierNodes.map((node) => `${node.topic}\u0000${node.partition}`));
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
    source_cursors: mixedStatusFixture.replay.source_cursors.filter((cursor) =>
      earlierKeys.has(`${cursor.topic}\u0000${cursor.partition}`)),
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
    source_cursors: [{ ...provisionalExecutionGraph.replay.source_cursors[0], max_ingest_watermark: 2 }],
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

/** Historical five-hop topology with synthetic watermarks; no adjacent bounds. */
export const RealFiveHopFixture: Story = {
  args: { correlationId: realFiveHopGraph.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => realFiveHopGraph,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Historical five-hop topology; ingest watermarks are synthetic fixture values, not captured run evidence.</p>
          <Story />
        </div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

/** Live transport presentation using the real topology fixture; no adjacent-bound capability. */
export const LiveReadOnlyFixture: Story = {
  args: { correlationId: realFiveHopGraph.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{ readLatest: async () => realFiveHopGraph }}>
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Presentation fixture only — live reads require the enabled signed workflow and test-realm authorization.</p>
          <Story />
        </div>
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
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Synthetic UI fixture only — stored-grade disagreement and ingest watermarks are not captured run evidence.</p>
          <Story />
        </div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

/** Synthetic incomplete-evidence status variant; it adds no graph edge. */
export const UnresolvedAndWithheldFixture: Story = {
  args: { correlationId: unresolvedAndWithheldFixture.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => unresolvedAndWithheldFixture,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Synthetic status fixture only — unresolved, withheld, and ingest watermark values are test-only, not captured run evidence.</p>
          <Story />
        </div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

/** Synthetic timestamp labels and watermarks over historical topology. */
export const ProjectionDetailFieldsFixture: Story = {
  args: { correlationId: projectionDetailFieldsFixture.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => projectionDetailFieldsFixture,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Historical topology; timestamps and ingest watermarks are synthetic fixture values, not captured run evidence.</p>
          <Story />
        </div>
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
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <p role="note">Synthetic playback and ingest watermark bounds; not captured run evidence.</p>
          <Story />
        </div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};

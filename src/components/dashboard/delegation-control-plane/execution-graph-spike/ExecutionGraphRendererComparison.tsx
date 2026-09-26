import { useState } from 'react';
import { Text } from '@/components/ui/typography';
import { GitGraphRenderer } from './GitGraphRenderer';
import { SvgTreeRenderer } from './SvgTreeRenderer';
import type { ModelExecutionGraph, ModelExecutionGraphNode } from './render-model';
import { replayLabel } from './render-model';
import './execution-graph-spike.css';

function NodeDetails({ graph, node }: { graph: ModelExecutionGraph; node: ModelExecutionGraphNode | null }) {
  if (!node) {
    return <Text as="p" size="xs" color="tertiary">Select a node to inspect its recorded fields.</Text>;
  }
  const stored = graph.annotations.stored_chain.find((grade) => grade.node_id === node.id);
  const label = graph.labels.find((value) => value.node_id === node.id);
  return (
    <dl className="execution-graph-details">
      <div><dt>Recorded node</dt><dd>{node.id}</dd></div>
      <div><dt>Topic</dt><dd>{node.topic}</dd></div>
      <div><dt>Source position</dt><dd>partition {node.partition}, offset {node.kafka_offset}</dd></div>
      <div><dt>Recorded parent</dt><dd>{node.parent_envelope_id ?? 'none'}</dd></div>
      <div><dt>Recomputed replay</dt><dd>{replayLabel(node)}</dd></div>
      <div><dt>Recomputed verifier</dt><dd>{node.verifier_verdict ?? 'not recorded'}</dd></div>
      <div><dt>Stored row annotation</dt><dd>{stored ? `hop ${stored.hop_index}: ${stored.replay_green == null ? 'unknown' : stored.replay_green ? 'passed' : 'failed'} / ${stored.verifier_verdict ?? 'unknown'}` : 'no stored hop annotation'}</dd></div>
      <div><dt>Ingest bound</dt><dd>{node.source_ref.ingest_seq == null ? 'legacy; no historical watermark' : `epoch ${node.source_ref.ingest_epoch}, seq ${node.source_ref.ingest_seq}`}</dd></div>
      <div><dt>Event time label</dt><dd>{label?.event_timestamp ?? 'not recorded'}</dd></div>
    </dl>
  );
}

export function ExecutionGraphRendererComparison({ graph }: { graph: ModelExecutionGraph }) {
  const [selectedNode, setSelectedNode] = useState<ModelExecutionGraphNode | null>(null);
  const graphHasRefusal = Boolean(graph.replay.refusal);

  return (
    <section className="execution-graph-spike" aria-labelledby="execution-graph-spike-title">
      <header className="execution-graph-spike__header">
        <div>
          <Text as="h2" size="md" weight="semibold" color="primary" id="execution-graph-spike-title">
            Recorded delegation path
          </Text>
          <Text as="p" size="xs" color="tertiary">
            Same projection, two renderers. Relationships and replay states come from the read model.
          </Text>
        </div>
        <Text as="span" size="xs" family="mono" color="tertiary">
          {graph.replay.nodes.length} nodes · {graph.replay.edges.length} recorded edges
        </Text>
      </header>

      {graphHasRefusal ? (
        <div className="execution-graph-refusal" role="status">
          <Text as="span" size="sm" weight="semibold" color="bad">This replay was refused.</Text>
          <Text as="span" size="xs" family="mono" color="secondary">{graph.replay.refusal}</Text>
          <Text as="span" size="xs" color="tertiary">No graph is drawn from conflicting envelope identity.</Text>
        </div>
      ) : (
        <div className="execution-graph-comparison">
          <section className="execution-graph-option" aria-label="Git-style graph renderer">
            <div className="execution-graph-option__heading">
              <Text as="h3" size="sm" weight="semibold" color="primary">Git-style lanes</Text>
              <Text as="span" size="xs" color="tertiary">branch-native layout</Text>
            </div>
            <GitGraphRenderer graph={graph} onSelect={setSelectedNode} />
          </section>
          <section className="execution-graph-option" aria-label="SVG tree renderer">
            <div className="execution-graph-option__heading">
              <Text as="h3" size="sm" weight="semibold" color="primary">SVG tree</Text>
              <Text as="span" size="xs" color="tertiary">recorded parent edges</Text>
            </div>
            <SvgTreeRenderer graph={graph} selectedNodeId={selectedNode?.id ?? null} onSelect={setSelectedNode} />
          </section>
        </div>
      )}

      <footer className="execution-graph-inspector">
        <Text as="h3" size="xs" weight="semibold" color="secondary">Selected evidence</Text>
        <NodeDetails graph={graph} node={selectedNode} />
      </footer>
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from '@/components/ui/typography';
import { SvgTreeRenderer } from './SvgTreeRenderer';
import { useExecutionGraphTransport } from './ExecutionGraphTransport';
import type { ModelExecutionGraph, ModelExecutionGraphNode } from './render-model';
import { replayLabel } from './render-model';
import './execution-graph-spike.css';

function NodeInspector({
  graph,
  node,
}: {
  graph: ModelExecutionGraph;
  node: ModelExecutionGraphNode | null;
}) {
  if (!node) {
    return <Text as="p" size="xs" color="tertiary">Select a node to inspect its recorded evidence.</Text>;
  }
  const stored = graph.annotations.stored_chain.find((grade) => grade.node_id === node.id);
  const label = graph.labels.find((value) => value.node_id === node.id);
  return (
    <dl className="execution-graph-details">
      <div><dt>Envelope</dt><dd>{node.id}</dd></div>
      <div><dt>Topic</dt><dd>{node.topic}</dd></div>
      <div><dt>Source</dt><dd>partition {node.partition}, offset {node.kafka_offset}</dd></div>
      <div><dt>Recorded parent</dt><dd>{node.parent_envelope_id ?? 'none'}</dd></div>
      <div><dt>Replay grade</dt><dd>{replayLabel(node)}</dd></div>
      <div><dt>Verifier</dt><dd>{node.verifier_verdict ?? 'not recorded'}</dd></div>
      <div>
        <dt>Stored chain annotation</dt>
        <dd>
          {stored
            ? `hop ${stored.hop_index}: ${stored.replay_green == null ? 'unknown' : stored.replay_green ? 'passed' : 'failed'} / ${stored.verifier_verdict ?? 'unknown'}`
            : 'no stored hop annotation'}
        </dd>
      </div>
      <div>
        <dt>Ingest watermark</dt>
        <dd>
          {node.source_ref.ingest_seq == null
            ? 'legacy row; no historical watermark'
            : `epoch ${node.source_ref.ingest_epoch}, sequence ${node.source_ref.ingest_seq}`}
        </dd>
      </div>
      <div><dt>Event timestamp label</dt><dd>{label?.event_timestamp ?? 'not recorded'}</dd></div>
    </dl>
  );
}

export function ExecutionGraphView({ correlationId }: { correlationId: string }) {
  const transport = useExecutionGraphTransport();
  const [graph, setGraph] = useState<ModelExecutionGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const graphRef = useRef<ModelExecutionGraph | null>(null);
  const stepInFlight = useRef(false);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    setPlaying(false);
    setGraph(null);
    setError(null);
    setSelectedNodeId(null);
    graphRef.current = null;
    if (!transport) return;

    let cancelled = false;
    setLoading(true);
    transport.readLatest(correlationId)
      .then((result) => {
        if (cancelled) return;
        graphRef.current = result;
        setGraph(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Graph read failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [correlationId, transport]);

  const advance = useCallback(async (direction: 'previous' | 'next'): Promise<boolean> => {
    const current = graphRef.current;
    if (!transport || !current || stepInFlight.current) return false;
    stepInFlight.current = true;
    setBusy(true);
    try {
      const next = await transport.step(correlationId, current.replay.source_cursors, direction);
      if (!next) return false;
      graphRef.current = next;
      setGraph(next);
      setSelectedNodeId(null);
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Replay step failed.');
      setPlaying(false);
      return false;
    } finally {
      stepInFlight.current = false;
      setBusy(false);
    }
  }, [correlationId, transport]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      void advance('next').then((moved) => {
        if (!moved) setPlaying(false);
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [advance, playing]);

  if (!transport) {
    return (
      <div className="execution-graph-state" role="status">
        <Text as="span" size="sm" weight="semibold" color="secondary">Graph read is not connected.</Text>
        <Text as="span" size="xs" color="tertiary">
          Connect the trusted workflow transport. This view does not accept tenant overrides or read directly from a database.
        </Text>
      </div>
    );
  }
  if (loading) return <Text as="div" size="sm" color="tertiary">Loading recorded graph…</Text>;
  if (error) {
    return (
      <div className="execution-graph-state" role="alert">
        <Text as="span" size="sm" weight="semibold" color="bad">Graph read failed.</Text>
        <Text as="span" size="xs" color="secondary">{error}</Text>
      </div>
    );
  }
  if (!graph) return <Text as="div" size="sm" color="tertiary">No replay is available for this correlation.</Text>;

  if (graph.replay.refusal) {
    return (
      <div className="execution-graph-refusal" role="status">
        <Text as="span" size="sm" weight="semibold" color="bad">This replay was refused.</Text>
        <Text as="span" size="xs" family="mono" color="secondary">{graph.replay.refusal}</Text>
        <Text as="span" size="xs" color="tertiary">No graph is drawn from conflicting or invalid evidence.</Text>
      </div>
    );
  }

  const selectedNode = graph.replay.nodes.find((node) => node.id === selectedNodeId) ?? null;
  return (
    <div className="execution-graph-view">
      <div className="execution-graph-view__meta">
        <Text as="span" size="xs" color="tertiary">
          {graph.replay.nodes.length} recorded nodes, {graph.replay.edges.length} recorded edges
        </Text>
        <Text as="span" size="xs" family="mono" color="tertiary">
          fold {graph.replay.fold_version.major}.{graph.replay.fold_version.minor}.{graph.replay.fold_version.patch}
        </Text>
      </div>

      {/* Provisional SVG candidate; the renderer remains a replaceable drawing adapter. */}
      <SvgTreeRenderer
        graph={graph}
        selectedNodeId={selectedNodeId}
        onSelect={(node) => setSelectedNodeId(node.id)}
      />

      <div className="execution-graph-legend" aria-label="Replay legend">
        <span><i className="execution-graph-legend__mark execution-graph-legend__mark--passed" /> Replay passed</span>
        <span><i className="execution-graph-legend__mark execution-graph-legend__mark--failed" /> Replay failed</span>
        <span><i className="execution-graph-legend__mark execution-graph-legend__mark--unknown" /> Unknown</span>
        <span><i className="execution-graph-legend__mark execution-graph-legend__mark--evidence" /> Ungraded re-route evidence</span>
      </div>

      <div className="execution-graph-cursor" aria-label="Replay cursor controls">
        <button type="button" onClick={() => void advance('previous')} disabled={busy}>
          Earlier bound
        </button>
        <button type="button" onClick={() => setPlaying((value) => !value)} disabled={busy} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => void advance('next')} disabled={busy}>
          Later bound
        </button>
        <Text as="span" size="xs" color="tertiary">
          Each step is resolved by the trusted read transport.
        </Text>
      </div>

      <section className="execution-graph-inspector" aria-label="Selected graph evidence">
        <Text as="h3" size="xs" weight="semibold" color="secondary">Selected evidence</Text>
        <NodeInspector graph={graph} node={selectedNode} />
      </section>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from '@/components/ui/typography';
import { SvgTreeRenderer } from './SvgTreeRenderer';
import { useExecutionGraphTransport } from './ExecutionGraphTransport';
import type { ModelExecutionGraph, ModelExecutionGraphEdge, ModelExecutionGraphNode } from './render-model';
import { formatModelSemVer, replayLabel } from './render-model';
import './execution-graph-spike.css';

function NodeInspector({ graph, node }: { graph: ModelExecutionGraph; node: ModelExecutionGraphNode | null }) {
  if (!node) {
    return (
      <Text as="p" size="xs" color="tertiary">
        Select a node to inspect its recorded evidence.
      </Text>
    );
  }
  const stored = graph.annotations.stored_chain.find((grade) => grade.node_id === node.id);
  const label = graph.labels.find((value) => value.node_id === node.id);
  return (
    <dl className="execution-graph-details">
      <div>
        <dt>Envelope</dt>
        <dd>{node.id}</dd>
      </div>
      <div>
        <dt>Topic</dt>
        <dd>{node.topic}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>
          partition {node.partition}, offset {node.kafka_offset}
        </dd>
      </div>
      <div>
        <dt>Recorded parent</dt>
        <dd>{node.parent_envelope_id ?? 'none'}</dd>
      </div>
      <div>
        <dt>Replay grade</dt>
        <dd>{replayLabel(node)}</dd>
      </div>
      <div>
        <dt>Verifier</dt>
        <dd>{node.verifier_verdict ?? 'not recorded'}</dd>
      </div>
      <div>
        <dt>Stored chain annotation</dt>
        <dd>
          {stored
            ? `hop ${stored.hop_index}: ${stored.replay_green == null ? 'unknown' : stored.replay_green ? 'passed' : 'failed'} / ${stored.verifier_verdict ?? 'unknown'}`
            : 'no stored hop annotation'}
        </dd>
      </div>
      <div>
        <dt>Kafka source offset</dt>
        <dd>{node.source_ref.kafka_offset}</dd>
      </div>
      <div>
        <dt>Event timestamp label</dt>
        <dd>{label?.event_timestamp ?? 'not recorded'}</dd>
      </div>
      <div>
        <dt>Ledger written at</dt>
        <dd>{label?.ledger_written_at ?? 'not recorded'}</dd>
      </div>
      <div>
        <dt>Pinned topology version</dt>
        <dd>
          {formatModelSemVer(graph.replay.topology_version.contract_version)} · SHA-256 {graph.replay.topology_version.topology_sha256}
        </dd>
      </div>
      <div>
        <dt>Pinned grader version</dt>
        <dd>{formatModelSemVer(graph.replay.grader_version)}</dd>
      </div>
      <div>
        <dt>Source cursor bounds ({graph.replay.source_cursors.length})</dt>
        <dd>
          <ul>
            {graph.replay.source_cursors.map((cursor) => (
              <li key={`${cursor.topic}:${cursor.partition}`}>
                {cursor.topic} — partition {cursor.partition}, through ingest watermark {cursor.max_ingest_watermark}
              </li>
            ))}
          </ul>
        </dd>
      </div>
    </dl>
  );
}

function EdgeInspector({ edge }: { edge: ModelExecutionGraphEdge }) {
  const endpointLabel = (endpoint: ModelExecutionGraphEdge['from_id']) => {
    if (endpoint.kind === 'node') return endpoint.node_id ?? 'unknown node';
    if (endpoint.kind === 'verdict') return endpoint.verdict_id ?? 'unknown verdict';
    return endpoint.session_id ?? 'unknown session';
  };
  return (
    <dl className="execution-graph-details">
      <div>
        <dt>Recorded edge</dt>
        <dd>{edge.id}</dd>
      </div>
      <div>
        <dt>Relationship</dt>
        <dd>{edge.kind}</dd>
      </div>
      <div>
        <dt>From</dt>
        <dd>{endpointLabel(edge.from_id)}</dd>
      </div>
      <div>
        <dt>To</dt>
        <dd>{endpointLabel(edge.to_id)}</dd>
      </div>
      <div>
        <dt>Evidence source</dt>
        <dd>{edge.evidence_ref.topic}</dd>
      </div>
      <div>
        <dt>Evidence position</dt>
        <dd>
          partition {edge.evidence_ref.partition}, offset {edge.evidence_ref.kafka_offset}
        </dd>
      </div>
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
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
    setSelectedEdgeId(null);
    graphRef.current = null;
    if (!transport) return;

    let cancelled = false;
    setLoading(true);
    transport
      .readLatest(correlationId)
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
    return () => {
      cancelled = true;
    };
  }, [correlationId, transport]);

  const advance = useCallback(
    async (direction: 'previous' | 'next'): Promise<boolean> => {
      const current = graphRef.current;
      if (!transport?.step || !current || stepInFlight.current) return false;
      stepInFlight.current = true;
      setBusy(true);
      try {
        const next = await transport.step(correlationId, current.replay.source_cursors, direction);
        if (!next) return false;
        graphRef.current = next;
        setGraph(next);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        return true;
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Replay step failed.');
        setPlaying(false);
        return false;
      } finally {
        stepInFlight.current = false;
        setBusy(false);
      }
    },
    [correlationId, transport],
  );

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let timer: number;
    const tick = async () => {
      const moved = await advance('next');
      if (cancelled) return;
      if (!moved) {
        setPlaying(false);
        return;
      }
      timer = window.setTimeout(() => {
        void tick();
      }, 900);
    };
    timer = window.setTimeout(() => {
      void tick();
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [advance, playing]);

  if (!transport) {
    return (
      <div className="execution-graph-state" role="status">
        <Text as="span" size="sm" weight="semibold" color="secondary">
          Graph read is not connected.
        </Text>
        <Text as="span" size="xs" color="tertiary">
          Connect the trusted workflow transport. This view does not accept tenant overrides or read directly from a database.
        </Text>
      </div>
    );
  }
  if (loading)
    return (
      <Text as="div" size="sm" color="tertiary">
        Loading recorded graph…
      </Text>
    );
  if (error) {
    return (
      <div className="execution-graph-state" role="alert">
        <Text as="span" size="sm" weight="semibold" color="bad">
          Graph read failed.
        </Text>
        <Text as="span" size="xs" color="secondary">
          {error}
        </Text>
      </div>
    );
  }
  if (!graph)
    return (
      <Text as="div" size="sm" color="tertiary">
        No replay is available for this correlation.
      </Text>
    );

  if (graph.replay.refusal) {
    return (
      <div className="execution-graph-refusal" role="status">
        <Text as="span" size="sm" weight="semibold" color="bad">
          This replay was refused.
        </Text>
        <Text as="span" size="xs" family="mono" color="secondary">
          {graph.replay.refusal}
        </Text>
        <Text as="span" size="xs" color="tertiary">
          No graph is drawn from conflicting or invalid evidence.
        </Text>
      </div>
    );
  }

  const selectedNode = graph.replay.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = graph.replay.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const statusCounts = graph.replay.nodes.reduce(
    (counts, node) => {
      if (node.replay_green === true) counts.passed += 1;
      else if (node.replay_green === false) counts.failed += 1;
      else counts.unknown += 1;
      return counts;
    },
    { passed: 0, failed: 0, unknown: 0 },
  );
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
        selectedEdgeId={selectedEdgeId}
        onSelect={(node) => {
          setSelectedNodeId(node.id);
          setSelectedEdgeId(null);
        }}
        onSelectEdge={(edge) => {
          setSelectedEdgeId(edge.id);
          setSelectedNodeId(null);
        }}
      />

      <div className="execution-graph-legend" aria-label="Replay legend">
        <span>
          <i className="execution-graph-legend__mark execution-graph-legend__mark--passed" /> Replay passed ({statusCounts.passed})
        </span>
        <span>
          <i className="execution-graph-legend__mark execution-graph-legend__mark--failed" /> Replay failed ({statusCounts.failed})
        </span>
        <span>
          <i className="execution-graph-legend__mark execution-graph-legend__mark--unknown" /> Unknown ({statusCounts.unknown})
        </span>
      </div>

      <section className="execution-graph-evidence-status" aria-label="Graph evidence status">
        <div className="execution-graph-evidence-status__summary">
          <span>Session anchor: {graph.replay.anchor.state}</span>
          <span>Unresolved records ({graph.replay.unresolved.length})</span>
          <span>Withheld evidence: {graph.replay.withheld_count}</span>
        </div>
        {graph.replay.unresolved.length > 0 && (
          <ul aria-label="Unresolved graph evidence">
            {graph.replay.unresolved.map((item) => (
              <li key={`${item.subject_id}:${item.reason}:${item.source_ref.topic}:${item.source_ref.partition}:${item.source_ref.kafka_offset}`}>
                <span>{item.subject_id}</span>
                <span>{item.reason}</span>
                <span>{item.source_ref.topic}</span>
                <span>partition {item.source_ref.partition}, offset {item.source_ref.kafka_offset}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {transport.step ? (
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
            Watermark-bound stepping is fixture-only; live adjacent-bound navigation is not yet available.
          </Text>
        </div>
      ) : (
        <Text as="div" size="xs" color="tertiary">Replay stepping is unavailable in live mode.</Text>
      )}

      <section className="execution-graph-inspector" aria-label="Selected graph evidence">
        <Text as="h3" size="xs" weight="semibold" color="secondary">
          Selected evidence
        </Text>
        {selectedEdge ? <EdgeInspector edge={selectedEdge} /> : <NodeInspector graph={graph} node={selectedNode} />}
      </section>
    </div>
  );
}

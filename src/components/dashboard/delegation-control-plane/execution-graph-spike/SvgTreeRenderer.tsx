import { useMemo } from 'react';
import type { ModelExecutionGraphEdge, ModelExecutionGraph, ModelExecutionGraphNode } from './render-model';
import { endpointNodeId, replayLabel } from './render-model';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 78;
const H_GAP = 32;
const V_GAP = 30;

interface Position {
  x: number;
  y: number;
}

function layoutNodes(graph: ModelExecutionGraph): Map<string, Position> {
  const byId = new Map(graph.replay.nodes.map((node) => [node.id, node]));
  const parentById = new Map<string, string>();
  const childIdsByParent = new Map<string, string[]>();

  for (const edge of graph.replay.edges) {
    const parentId = endpointNodeId(edge.from_id);
    const childId = endpointNodeId(edge.to_id);
    if (parentId && childId && byId.has(parentId) && byId.has(childId)) {
      parentById.set(childId, parentId);
      const children = childIdsByParent.get(parentId) ?? [];
      children.push(childId);
      childIdsByParent.set(parentId, children);
    }
  }

  const positions = new Map<string, Position>();
  let nextLane = 0;
  for (const id of graph.replay.order) {
    if (!byId.has(id)) continue;
    const parentId = parentById.get(id);
    const parent = parentId ? positions.get(parentId) : undefined;
    const siblings = parentId ? (childIdsByParent.get(parentId) ?? []) : [];
    const lane = parent && siblings.length === 1 ? parent.y / (NODE_HEIGHT + V_GAP) : nextLane++;
    positions.set(id, {
      x: parent ? parent.x + NODE_WIDTH + H_GAP : 24,
      y: 24 + lane * (NODE_HEIGHT + V_GAP),
    });
  }
  return positions;
}

function nodeTitle(node: ModelExecutionGraphNode): string {
  const topicName = node.topic.split('.').slice(-2).join('.');
  return node.kind === 'reroute_evidence' ? `${topicName} · evidence` : topicName;
}

export function SvgTreeRenderer({
  graph,
  selectedNodeId,
  selectedEdgeId = null,
  onSelect,
  onSelectEdge,
}: {
  graph: ModelExecutionGraph;
  selectedNodeId: string | null;
  selectedEdgeId?: string | null;
  onSelect: (node: ModelExecutionGraphNode) => void;
  onSelectEdge?: (edge: ModelExecutionGraphEdge) => void;
}) {
  const positions = useMemo(() => layoutNodes(graph), [graph]);
  const extent = [...positions.values()].reduce(
    (acc, point) => ({
      width: Math.max(acc.width, point.x + NODE_WIDTH + 24),
      height: Math.max(acc.height, point.y + NODE_HEIGHT + 24),
    }),
    { width: 640, height: 210 },
  );

  return (
    <div className="execution-graph-svg-scroll">
      <svg
        aria-label="Recorded delegation execution graph"
        className="execution-graph-svg"
        role="group"
        viewBox={`0 0 ${extent.width} ${extent.height}`}
        width={extent.width}
        height={extent.height}
      >
        <defs>
          <marker id="execution-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--text-tertiary)" />
          </marker>
        </defs>
        {graph.replay.edges.map((edge) => {
          const from = endpointNodeId(edge.from_id);
          const to = endpointNodeId(edge.to_id);
          const source = from ? positions.get(from) : undefined;
          const target = to ? positions.get(to) : undefined;
          if (!source || !target) return null;
          const x1 = source.x + NODE_WIDTH;
          const y1 = source.y + NODE_HEIGHT / 2;
          const x2 = target.x;
          const y2 = target.y + NODE_HEIGHT / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={edge.id}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              markerEnd="url(#execution-graph-arrow)"
              stroke={edge.id === selectedEdgeId ? 'var(--accent, #7c9)' : 'var(--line-strong, #8a8d91)'}
              strokeWidth={edge.id === selectedEdgeId ? 3 : 1.5}
              data-edge-kind={edge.kind}
              role={onSelectEdge ? 'button' : undefined}
              tabIndex={onSelectEdge ? 0 : undefined}
              aria-label={onSelectEdge ? `${edge.kind} edge. ${from} to ${to}. Select edge evidence.` : undefined}
              aria-pressed={onSelectEdge ? edge.id === selectedEdgeId : undefined}
              onClick={onSelectEdge ? () => onSelectEdge(edge) : undefined}
              onKeyDown={
                onSelectEdge
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectEdge(edge);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
        {graph.replay.nodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          const selected = node.id === selectedNodeId;
          const state = node.replay_green === true ? 'passed' : node.replay_green === false ? 'failed' : 'unknown';
          return (
            <g
              key={node.id}
              className={`execution-graph-node execution-graph-node--${state}${node.kind === 'reroute_evidence' ? ' execution-graph-node--evidence' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${nodeTitle(node)}. ${replayLabel(node)}.`}
              aria-pressed={selected}
              onClick={() => onSelect(node)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(node);
                }
              }}
            >
              <rect
                x={point.x}
                y={point.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={node.kind === 'reroute_evidence' ? 3 : 7}
                className="execution-graph-node__surface"
                strokeWidth={selected ? 2.5 : 1}
              />
              <text x={point.x + 13} y={point.y + 25} className="execution-graph-node__title">
                {nodeTitle(node).slice(0, 29)}
              </text>
              <text x={point.x + 13} y={point.y + 47} className="execution-graph-node__status">
                {replayLabel(node)}
              </text>
              <text x={point.x + 13} y={point.y + 65} className="execution-graph-node__position">
                {`partition ${node.partition} · offset ${node.kafka_offset}`}
              </text>
            </g>
          );
        })}
      </svg>
      {graph.replay.nodes.length === 0 && <p>No recorded nodes in this replay.</p>}
    </div>
  );
}

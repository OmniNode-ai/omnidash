import { useEffect, useRef } from 'react';
import { createGitgraph, MergeStyle, Orientation, TemplateName, templateExtend } from '@gitgraph/js';
import type { ModelExecutionGraph, ModelExecutionGraphNode } from './render-model';
import { endpointNodeId } from './render-model';

function topicLabel(node: ModelExecutionGraphNode): string {
  const topicName = node.topic.split('.').slice(-2).join('.');
  return node.kind === 'reroute_evidence' ? `${topicName} · evidence` : topicName;
}

/** Experimental adapter: GitGraph draws only model-declared node/edge relationships. */
export function GitGraphRenderer({
  graph,
  onSelect,
}: {
  graph: ModelExecutionGraph;
  onSelect: (node: ModelExecutionGraphNode) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    const graphApi = createGitgraph(host, {
      orientation: Orientation.VerticalReverse,
      responsive: true,
      template: templateExtend(TemplateName.Metro, {
        colors: ['#477f9f', '#b66e3c', '#5f916f', '#866e9d', '#aa665f'],
        branch: {
          lineWidth: 2,
          mergeStyle: MergeStyle.Bezier,
          spacing: 36,
          label: { display: false },
        },
        commit: {
          spacing: 64,
          hasTooltipInCompactMode: false,
          dot: { size: 9, font: '10px "IBM Plex Sans", sans-serif' },
          message: {
            display: true,
            displayAuthor: false,
            displayHash: false,
            font: '12px "IBM Plex Sans", sans-serif',
            color: '#333b40',
          },
        },
      }),
    });

    const nodes = new Map(graph.replay.nodes.map((node) => [node.id, node]));
    const parentByNode = new Map<string, string>();
    const childrenByParent = new Map<string, string[]>();
    for (const edge of graph.replay.edges) {
      const fromId = endpointNodeId(edge.from_id);
      const toId = endpointNodeId(edge.to_id);
      if (!fromId || !toId || !nodes.has(fromId) || !nodes.has(toId)) continue;
      parentByNode.set(toId, fromId);
      childrenByParent.set(fromId, [...(childrenByParent.get(fromId) ?? []), toId]);
    }

    const branchesByNode = new Map<string, ReturnType<typeof graphApi.branch>>();
    for (const id of graph.replay.order) {
      const node = nodes.get(id);
      if (!node) continue;
      const parentId = parentByNode.get(id);
      const parentBranch = parentId ? branchesByNode.get(parentId) : undefined;
      const siblings = parentId ? childrenByParent.get(parentId) ?? [] : [];
      const branch = parentBranch
        ? siblings.length > 1
          ? parentBranch.branch(`lane-${graph.replay.order.indexOf(id) + 1}`)
          : parentBranch
        : graphApi.branch(`lane-${graph.replay.order.indexOf(id) + 1}`);
      const outcome = node.replay_green === true ? '✓' : node.replay_green === false ? '×' : '?';
      const dotColor = node.replay_green === true
        ? '#26784b'
        : node.replay_green === false
          ? '#b54842'
          : '#707b83';
      branch.commit({
        subject: `${outcome} ${topicLabel(node)}`,
        // Keep replay status visible in the commit dot and share the inspector below.
        dotText: node.kind === 'reroute_evidence' ? `↻${outcome}` : outcome,
        style: {
          dot: {
            size: node.kind === 'reroute_evidence' ? 11 : 10,
            color: dotColor,
            strokeColor: '#ffffff',
            strokeWidth: 1,
          },
        },
        onClick: () => onSelect(node),
        onMessageClick: () => onSelect(node),
      });
      branchesByNode.set(id, branch);
    }
  }, [graph, onSelect]);

  return (
    <div className="execution-graph-gitgraph-scroll" aria-label="Git-style renderer comparison">
      <div ref={hostRef} className="execution-graph-gitgraph" />
      <ul className="execution-graph-gitgraph-key" aria-label="Replay state legend">
        <li>✓ Replay passed</li>
        <li>× Replay failed</li>
        <li>? unknown</li>
      </ul>
    </div>
  );
}

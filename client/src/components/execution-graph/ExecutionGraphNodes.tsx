/**
 * Custom React Flow Node Components for ONEX Node Execution Graph
 *
 * Provides visual representations of ONEX node executions with:
 * - Status-based coloring (pending, running, success, failed, skipped)
 * - Node kind icons (EFFECT, COMPUTE, REDUCER, ORCHESTRATOR)
 * - Duration display
 * - Animation for running state
 */

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Database, Cpu, Layers, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NodeKind, NodeStatus, ExecutionNode } from './executionGraphTypes';

// Status color mapping
const statusStyles: Record<NodeStatus, { bg: string; border: string; text: string }> = {
  pending: {
    bg: 'bg-muted',
    border: 'border-muted-foreground/50',
    text: 'text-muted-foreground',
  },
  running: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    bg: 'bg-green-500/10',
    border: 'border-green-500',
    text: 'text-green-600 dark:text-green-400',
  },
  failed: {
    bg: 'bg-red-500/10',
    border: 'border-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
  skipped: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
};

// Node kind icon mapping
const nodeKindIcons: Record<NodeKind, typeof Database> = {
  EFFECT: Database,
  COMPUTE: Cpu,
  REDUCER: Layers,
  ORCHESTRATOR: Network,
};

// Node kind badge colors
const nodeKindStyles: Record<NodeKind, string> = {
  EFFECT: 'bg-teal-500/10 text-teal-600 border-teal-500/30 dark:text-teal-400',
  COMPUTE: 'bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400',
  REDUCER: 'bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400',
  ORCHESTRATOR: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30 dark:text-indigo-400',
};

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * ExecutionGraphNode - Custom node component for the execution graph
 *
 * Renders an ONEX node with:
 * - Colored border based on execution status
 * - Icon based on node kind (EFFECT/COMPUTE/REDUCER/ORCHESTRATOR)
 * - Node label
 * - Type pill badge
 * - Duration badge when available
 * - Animated border when running
 * - Selection highlight
 * - Input/output handles for connections
 */
export function ExecutionGraphNode({ data, selected }: NodeProps<ExecutionNode>) {
  const { label, nodeKind, status, durationMs } = data;

  const statusStyle = statusStyles[status];
  const kindStyle = nodeKindStyles[nodeKind];
  const Icon = nodeKindIcons[nodeKind];

  return (
    <div
      className={cn(
        // Base styles
        'relative w-48 rounded-lg border-2 shadow-sm transition-all duration-200',
        // Background and border based on status
        statusStyle.bg,
        statusStyle.border,
        // Selection highlight
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        // Running animation
        status === 'running' && 'animate-pulse'
      )}
    >
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!w-2 !h-2 !bg-transparent !border-0 !min-w-0 !min-h-0"
      />
      {/* Input handle (left side) - main horizontal flow input */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-2 !h-2 !bg-transparent !border-0 !min-w-0 !min-h-0"
      />
      {/* Input handle (right side) */}
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="!w-2 !h-2 !bg-transparent !border-0 !min-w-0 !min-h-0"
      />

      {/* Node content */}
      <div className="p-3">
        {/* Header with icon and label */}
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('p-1.5 rounded-md', statusStyle.bg, statusStyle.text)}>
            <Icon className="w-4 h-4" />
          </div>
          <span
            className={cn('font-medium text-sm truncate flex-1', statusStyle.text)}
            title={label}
          >
            {label}
          </span>
        </div>

        {/* Footer with type badge and duration */}
        <div className="flex items-center justify-between gap-2">
          {/* Node kind badge */}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-5 font-mono uppercase tracking-wide',
              kindStyle
            )}
          >
            {nodeKind}
          </Badge>

          {/* Duration badge (if available) */}
          {durationMs !== undefined && durationMs !== null && (
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1.5 py-0 h-5 font-mono', statusStyle.text)}
            >
              {formatDuration(durationMs)}
            </Badge>
          )}
        </div>

        {/* Status indicator dot for running state */}
        {status === 'running' && (
          <div className="absolute top-2 right-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          </div>
        )}
      </div>

      {/* Output handle (bottom) - invisible but functional */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!w-2 !h-2 !bg-transparent !border-0 !min-w-0 !min-h-0"
      />
      {/* Output handle (right side) - for routing edges around nodes */}
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-2 !h-2 !bg-transparent !border-0 !min-w-0 !min-h-0"
        style={{ top: '70%' }}
      />
    </div>
  );
}

/**
 * Node types map for React Flow registration
 *
 * Usage:
 * ```tsx
 * import { ReactFlow } from '@xyflow/react';
 * import { executionNodeTypes } from './ExecutionGraphNodes';
 *
 * <ReactFlow nodeTypes={executionNodeTypes} ... />
 * ```
 */
export const executionNodeTypes = {
  executionNode: ExecutionGraphNode,
};

/**
 * Export status styles for use in legends or other components
 */
export { statusStyles, nodeKindIcons, nodeKindStyles };

/**
 * ExecutionGraph Page (OMN-1406)
 *
 * Page component for the Node Execution Graph visualization.
 * Displays the ONEX four-node architecture workflow executions
 * with real-time updates and detailed node inspection.
 *
 * Route: /graph
 */

import { ExecutionGraphPanel } from '@/components/execution-graph/ExecutionGraphPanel';

export default function ExecutionGraph() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      {/* Page Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Node Execution Graph</h1>
        <p className="text-muted-foreground">
          Visualize ONEX node executions and data flow in real-time
        </p>
      </div>

      {/* Graph Panel */}
      <ExecutionGraphPanel className="h-[calc(100%-4rem)] rounded-lg border bg-card" />
    </div>
  );
}

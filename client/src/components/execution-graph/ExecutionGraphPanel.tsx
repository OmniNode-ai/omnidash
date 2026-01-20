/**
 * ExecutionGraphPanel - Complete Panel Component (OMN-1406)
 *
 * Embeddable panel that integrates the React Flow canvas with the inspector
 * drawer and control buttons. Designed for the /graph page and potential
 * embedding in other dashboards.
 *
 * Features:
 * - Live indicator with green pulsing dot
 * - Execution scenario selector (Latest, Success, Failure, Running)
 * - Pause/Play toggle for future WebSocket streaming
 * - Clear and Fit View buttons
 * - Node selection with inspector drawer
 */

import { useState, useCallback, useEffect } from 'react';
import { Play, Pause, Trash2, Maximize2, ChevronDown, Radio, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { ExecutionGraphCanvas } from './ExecutionGraphCanvas';
import { ExecutionGraphInspector } from './ExecutionGraphInspector';
import { generateMockExecutionGraph } from './mockGraphData';
import { nodeToSelectedDetails, createInitialGraph } from './normalizeGraphEvents';
import type { ExecutionGraph, SelectedNodeDetails } from './executionGraphTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Scenario = 'success' | 'failure' | 'running';

interface ScenarioOption {
  label: string;
  value: Scenario;
  description: string;
}

const SCENARIO_OPTIONS: ScenarioOption[] = [
  { label: 'Success', value: 'success', description: 'Completed workflow' },
  { label: 'Failure', value: 'failure', description: 'Failed at inference' },
  { label: 'Running', value: 'running', description: 'In-progress workflow' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutionGraphPanelProps {
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ExecutionGraphPanel({ className }: ExecutionGraphPanelProps) {
  // Graph state
  const [currentGraph, setCurrentGraph] = useState<ExecutionGraph>(() =>
    generateMockExecutionGraph('success')
  );
  const [currentScenario, setCurrentScenario] = useState<Scenario>('success');

  // Selection state
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Live streaming state (for future WebSocket integration)
  const [isLive, setIsLive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Derive selected node details for inspector
  const selectedNodeDetails: SelectedNodeDetails | null =
    selectedNodeName && currentGraph.nodes[selectedNodeName]
      ? nodeToSelectedDetails(currentGraph.nodes[selectedNodeName])
      : null;

  // Handle node click -> open inspector
  const handleNodeClick = useCallback((nodeName: string) => {
    setSelectedNodeName(nodeName);
    setIsInspectorOpen(true);
  }, []);

  // Handle inspector close
  const handleInspectorClose = useCallback(() => {
    setIsInspectorOpen(false);
  }, []);

  // Handle scenario change
  const handleScenarioChange = useCallback((scenario: Scenario) => {
    setCurrentScenario(scenario);
    setCurrentGraph(generateMockExecutionGraph(scenario));
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, []);

  // Handle pause/play toggle
  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Handle clear graph
  const handleClearGraph = useCallback(() => {
    setCurrentGraph(createInitialGraph(`cleared-${Date.now()}`));
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, []);

  // Handle refresh (reload current scenario)
  const handleRefresh = useCallback(() => {
    setCurrentGraph(generateMockExecutionGraph(currentScenario));
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, [currentScenario]);

  // Get current scenario label
  const currentScenarioLabel =
    SCENARIO_OPTIONS.find((s) => s.value === currentScenario)?.label || 'Select';

  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Top Control Bar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg border border-border p-2 shadow-sm">
        {/* Live Indicator */}
        <div className="flex items-center gap-2 px-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-75',
                isLive && !isPaused ? 'animate-ping bg-green-400' : 'bg-gray-400'
              )}
            />
            <span
              className={cn(
                'relative inline-flex rounded-full h-2.5 w-2.5',
                isLive && !isPaused ? 'bg-green-500' : 'bg-gray-500'
              )}
            />
          </span>
          <span
            className={cn(
              'text-xs font-medium uppercase tracking-wide',
              isLive && !isPaused ? 'text-green-500' : 'text-muted-foreground'
            )}
          >
            {isPaused ? 'Paused' : isLive ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Scenario Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Radio className="h-3.5 w-3.5" />
              <span>{currentScenarioLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Demo Scenarios</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SCENARIO_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => handleScenarioChange(option.value)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-4 w-px bg-border" />

        {/* Control Buttons */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleTogglePause}
          title={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleClearGraph}
          title="Clear Graph"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Graph Stats Badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg border border-border px-3 py-2 shadow-sm">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Nodes:</span>
            <span className="font-mono font-medium">{Object.keys(currentGraph.nodes).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Edges:</span>
            <span className="font-mono font-medium">{currentGraph.edges.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">ID:</span>
            <span className="font-mono text-muted-foreground">
              {currentGraph.correlationId.slice(0, 12)}...
            </span>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <ExecutionGraphCanvas
        graph={currentGraph}
        onNodeClick={handleNodeClick}
        selectedNodeName={selectedNodeName}
        className="h-full w-full"
      />

      {/* Inspector Drawer */}
      <ExecutionGraphInspector
        selectedNode={selectedNodeDetails}
        isOpen={isInspectorOpen}
        onClose={handleInspectorClose}
      />
    </div>
  );
}

export default ExecutionGraphPanel;

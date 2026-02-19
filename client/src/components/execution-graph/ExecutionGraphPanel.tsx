/**
 * ExecutionGraphPanel - Complete Panel Component (OMN-1406, OMN-2302)
 *
 * Embeddable panel that integrates the React Flow canvas with the inspector
 * drawer and control buttons. Designed for the /graph page and potential
 * embedding in other dashboards.
 *
 * Features:
 * - Live indicator with green pulsing dot (real WS events or demo)
 * - Source selector: Live (real-time WS) vs Mock Scenarios (demo)
 * - In Live mode: correlation ID picker populated from REST history
 * - In Demo mode: scenario selector (Success / Failure / Running)
 * - Pause/Play toggle
 * - Clear and Fit View buttons
 * - Node selection with inspector drawer
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Maximize2,
  ChevronDown,
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

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
import { useExecutionGraph } from '@/hooks/useExecutionGraph';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SourceMode = 'live' | 'demo';

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
  // ─── Source mode ───────────────────────────────────────────────────────────
  const [sourceMode, setSourceMode] = useState<SourceMode>('live');

  // ─── Live data from hook ───────────────────────────────────────────────────
  const {
    liveGraph,
    historicalExecutions,
    isLive,
    selectedCorrelationId,
    setSelectedCorrelationId,
    selectedHistoricalGraph,
  } = useExecutionGraph();

  // ─── Demo (mock) state ─────────────────────────────────────────────────────
  const [demoGraph, setDemoGraph] = useState<ExecutionGraph>(() =>
    generateMockExecutionGraph('success')
  );
  const [currentScenario, setCurrentScenario] = useState<Scenario>('success');

  // ─── Shared UI state ───────────────────────────────────────────────────────
  const [isPaused, setIsPaused] = useState(false);
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // ─── Resolve the graph to display ─────────────────────────────────────────
  // Priority:
  //   demo mode → demoGraph
  //   live mode + paused + nothing selected → last liveGraph snapshot (managed below)
  //   live mode + historical selected → selectedHistoricalGraph
  //   live mode + no selection → liveGraph
  const [pausedSnapshot, setPausedSnapshot] = useState<ExecutionGraph | null>(null);

  // Capture a snapshot when the user pauses in live mode
  useEffect(() => {
    if (sourceMode === 'live' && isPaused && !pausedSnapshot) {
      setPausedSnapshot(liveGraph);
    }
    if (!isPaused) {
      setPausedSnapshot(null);
    }
  }, [isPaused, sourceMode, liveGraph, pausedSnapshot]);

  const currentGraph: ExecutionGraph = (() => {
    if (sourceMode === 'demo') return demoGraph;
    if (selectedHistoricalGraph) return selectedHistoricalGraph;
    if (isPaused && pausedSnapshot) return pausedSnapshot;
    return liveGraph;
  })();

  // Derive selected node details for inspector
  const selectedNodeDetails: SelectedNodeDetails | null =
    selectedNodeName && currentGraph.nodes[selectedNodeName]
      ? nodeToSelectedDetails(currentGraph.nodes[selectedNodeName])
      : null;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((nodeName: string) => {
    setSelectedNodeName(nodeName);
    setIsInspectorOpen(true);
  }, []);

  const handleInspectorClose = useCallback(() => {
    setIsInspectorOpen(false);
  }, []);

  // Demo scenario change
  const handleScenarioChange = useCallback((scenario: Scenario) => {
    setCurrentScenario(scenario);
    setDemoGraph(generateMockExecutionGraph(scenario));
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, []);

  // Pause / Play
  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Clear
  const handleClearGraph = useCallback(() => {
    if (sourceMode === 'demo') {
      setDemoGraph(createInitialGraph(`cleared-${Date.now()}`));
    }
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, [sourceMode]);

  // Refresh
  const handleRefresh = useCallback(() => {
    if (sourceMode === 'demo') {
      setDemoGraph(generateMockExecutionGraph(currentScenario));
    }
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
  }, [sourceMode, currentScenario]);

  // Source mode toggle
  const handleSetSourceMode = useCallback((mode: SourceMode) => {
    setSourceMode(mode);
    setSelectedNodeName(null);
    setIsInspectorOpen(false);
    setIsPaused(false);
    setPausedSnapshot(null);
  }, []);

  // Historical correlation ID selection
  const handleSelectCorrelationId = useCallback(
    (id: string | null) => {
      setSelectedCorrelationId(id);
      setSelectedNodeName(null);
      setIsInspectorOpen(false);
    },
    [setSelectedCorrelationId]
  );

  // ─── Derived display values ────────────────────────────────────────────────

  const currentScenarioLabel =
    SCENARIO_OPTIONS.find((s) => s.value === currentScenario)?.label || 'Select';

  const isEffectivelyLive = sourceMode === 'live' && isLive && !isPaused && !selectedCorrelationId;

  const liveStatusLabel = (() => {
    if (sourceMode === 'demo') return 'Demo';
    if (!isLive) return 'Offline';
    if (isPaused) return 'Paused';
    if (selectedCorrelationId) return 'History';
    return 'Live';
  })();

  const selectedCidShort = selectedCorrelationId
    ? selectedCorrelationId.slice(0, 8) + '...'
    : 'Live stream';

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
                isEffectivelyLive ? 'animate-ping bg-green-400' : 'bg-gray-400'
              )}
            />
            <span
              className={cn(
                'relative inline-flex rounded-full h-2.5 w-2.5',
                isEffectivelyLive ? 'bg-green-500' : 'bg-gray-500'
              )}
            />
          </span>
          <span
            className={cn(
              'text-xs font-medium uppercase tracking-wide',
              isEffectivelyLive ? 'text-green-500' : 'text-muted-foreground'
            )}
          >
            {liveStatusLabel}
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Source Mode Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              {sourceMode === 'live' ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              <span>{sourceMode === 'live' ? 'Live' : 'Demo'}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Source</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleSetSourceMode('live')}>
              <Wifi className="mr-2 h-3.5 w-3.5" />
              <div>
                <div className="font-medium">Live</div>
                <div className="text-xs text-muted-foreground">Real-time WS events</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSetSourceMode('demo')}>
              <WifiOff className="mr-2 h-3.5 w-3.5" />
              <div>
                <div className="font-medium">Demo</div>
                <div className="text-xs text-muted-foreground">Mock scenarios</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-4 w-px bg-border" />

        {/* Scenario selector (Demo mode) OR Correlation ID picker (Live mode) */}
        {sourceMode === 'demo' ? (
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
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 max-w-[160px]">
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selectedCidShort}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Execution History</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleSelectCorrelationId(null)}>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">Live stream</span>
                  <span className="text-xs text-muted-foreground">Follow incoming events</span>
                </div>
              </DropdownMenuItem>
              {historicalExecutions.length > 0 && <DropdownMenuSeparator />}
              {historicalExecutions.map((exec) => (
                <DropdownMenuItem
                  key={exec.correlationId}
                  onClick={() => handleSelectCorrelationId(exec.correlationId)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-mono text-xs font-medium">
                    {exec.correlationId.slice(0, 16)}...
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {exec.eventCount} events &middot;{' '}
                    {new Date(exec.latestTimestamp).toLocaleTimeString()}
                  </span>
                </DropdownMenuItem>
              ))}
              {historicalExecutions.length === 0 && (
                <DropdownMenuItem disabled>
                  <span className="text-xs text-muted-foreground">No historical data yet</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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

/**
 * ExecutionGraphInspector - Node Details Drawer (OMN-1406)
 *
 * Right-side drawer component that displays detailed information about a selected
 * node in the execution graph. Designed for investor demos with comprehensive
 * metadata display, collapsible JSON payloads, and prominent error visualization.
 *
 * Features:
 * - Status badge with color coding
 * - Node kind identification
 * - Timing information (start, end, duration)
 * - Collapsible input/output payload sections
 * - Prominent error message display for failed nodes
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  PauseCircle,
} from 'lucide-react';

import type { SelectedNodeDetails, NodeKind, NodeStatus } from './executionGraphTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutionGraphInspectorProps {
  selectedNode: SelectedNodeDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format ISO timestamp to readable time format with milliseconds
 */
function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch {
    return timestamp;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return 'N/A';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(2)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = ((durationMs % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get status badge variant and color based on node status
 */
function getStatusBadgeProps(status: NodeStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'pending':
      return {
        variant: 'secondary',
        className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        icon: PauseCircle,
      };
    case 'running':
      return {
        variant: 'default',
        className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        icon: Loader2,
      };
    case 'success':
      return {
        variant: 'default',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: CheckCircle2,
      };
    case 'failed':
      return {
        variant: 'destructive',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: AlertCircle,
      };
    case 'skipped':
      return {
        variant: 'outline',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        icon: MinusCircle,
      };
    default:
      return {
        variant: 'secondary',
        className: '',
        icon: PauseCircle,
      };
  }
}

/**
 * Get human-readable label for node kind
 */
function getNodeKindLabel(kind: NodeKind): string {
  const labels: Record<NodeKind, string> = {
    ORCHESTRATOR: 'Orchestrator',
    EFFECT: 'Effect Node',
    COMPUTE: 'Compute Node',
    REDUCER: 'Reducer Node',
  };
  return labels[kind] || kind;
}

/**
 * Get node kind pill color
 */
function getNodeKindColor(kind: NodeKind): string {
  const colors: Record<NodeKind, string> = {
    ORCHESTRATOR: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    EFFECT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    COMPUTE: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    REDUCER: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  };
  return colors[kind] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Viewer Component
// ─────────────────────────────────────────────────────────────────────────────

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

function JsonViewer({ data, maxHeight = '200px' }: JsonViewerProps) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">No data</span>;
  }

  return (
    <ScrollArea className="rounded-md border bg-muted/50" style={{ maxHeight }}>
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible Section Component
// ─────────────────────────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <span className="uppercase tracking-wide">{title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Row Component
// ─────────────────────────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ExecutionGraphInspector({
  selectedNode,
  isOpen,
  onClose,
}: ExecutionGraphInspectorProps) {
  // Get status badge properties
  const statusProps = selectedNode ? getStatusBadgeProps(selectedNode.status) : null;
  const StatusIcon = statusProps?.icon;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:max-w-[400px] overflow-hidden flex flex-col">
        {selectedNode ? (
          <>
            {/* Header */}
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2 text-lg">
                {StatusIcon && (
                  <StatusIcon
                    className={cn(
                      'w-5 h-5',
                      selectedNode.status === 'running' && 'animate-spin',
                      selectedNode.status === 'success' && 'text-green-500',
                      selectedNode.status === 'failed' && 'text-red-500',
                      selectedNode.status === 'pending' && 'text-slate-400',
                      selectedNode.status === 'skipped' && 'text-yellow-500'
                    )}
                  />
                )}
                <span className="truncate">{selectedNode.name}</span>
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn('text-xs', getNodeKindColor(selectedNode.kind))}
                >
                  {getNodeKindLabel(selectedNode.kind)}
                </Badge>
                {statusProps && (
                  <Badge
                    variant={statusProps.variant}
                    className={cn('text-xs capitalize', statusProps.className)}
                  >
                    {selectedNode.status}
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            <Separator />

            {/* Scrollable Content */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 py-4">
                {/* Metadata Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Metadata
                  </h4>
                  <div className="space-y-1 bg-muted/30 rounded-lg p-3">
                    <DetailRow
                      label="Started at"
                      value={formatTimestamp(selectedNode.startedAt)}
                      icon={<Clock className="w-3.5 h-3.5" />}
                    />
                    <DetailRow
                      label="Finished at"
                      value={formatTimestamp(selectedNode.finishedAt)}
                      icon={<Clock className="w-3.5 h-3.5" />}
                    />
                    <DetailRow
                      label="Duration"
                      value={formatDuration(selectedNode.durationMs)}
                      icon={<Clock className="w-3.5 h-3.5" />}
                    />
                    {selectedNode.correlationId && (
                      <DetailRow
                        label="Correlation ID"
                        value={
                          <span className="text-xs">
                            {selectedNode.correlationId.slice(0, 12)}...
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>

                {/* Error Section - Prominent display for failed nodes */}
                {selectedNode.status === 'failed' && selectedNode.errorMessage && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-red-400 uppercase tracking-wide flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Error
                    </h4>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <p className="text-sm text-red-300 font-mono whitespace-pre-wrap break-words">
                        {selectedNode.errorMessage}
                      </p>
                    </div>
                  </div>
                )}

                {/* Input Payload Section */}
                <div className="space-y-2">
                  <CollapsibleSection title="Input Payload" defaultOpen={false}>
                    <JsonViewer data={selectedNode.inputPayload} maxHeight="250px" />
                  </CollapsibleSection>
                </div>

                {/* Output Payload Section */}
                <div className="space-y-2">
                  <CollapsibleSection title="Output Payload" defaultOpen={false}>
                    <JsonViewer data={selectedNode.outputPayload} maxHeight="250px" />
                  </CollapsibleSection>
                </div>

                {/* Additional Metadata if present */}
                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <div className="space-y-2">
                    <CollapsibleSection title="Additional Metadata" defaultOpen={false}>
                      <JsonViewer data={selectedNode.metadata} maxHeight="200px" />
                    </CollapsibleSection>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                <MinusCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Select a node to view details</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ExecutionGraphInspector;

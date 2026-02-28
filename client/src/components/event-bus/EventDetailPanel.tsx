/**
 * EventDetailPanel Component
 *
 * A slide-out panel showing detailed information about a selected event.
 * Displays event metadata, topic information, and the full JSON payload.
 *
 * Part of the Event Bus monitoring infrastructure.
 */

import { useMemo, useState, useRef, useEffect, Component, ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Radio,
  Clock,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileJson,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  Timer,
  BarChart2,
  Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Import utilities from extracted module
import {
  TOPIC_CONFIG,
  PRIORITY_CONFIG,
  COPY_FEEDBACK_TIMEOUT_MS,
  getTopicDomain,
  formatTimestamp,
  formatPayload,
  extractParsedDetails,
  safeJsonStringify,
  safePercentage,
  type ParsedDetails,
} from './eventDetailUtils';

/**
 * Error boundary for catching render errors in payload content
 */
interface PayloadErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface PayloadErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PayloadErrorBoundary extends Component<PayloadErrorBoundaryProps, PayloadErrorBoundaryState> {
  constructor(props: PayloadErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PayloadErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Note: Using console.error directly is the appropriate pattern for React error boundaries.
    // Error boundaries are specifically designed to catch and log rendering errors.
    // The server-side intentLogger is not available in client-side code.
    // Suppressed in production to avoid console noise.
    if (import.meta.env.DEV) {
      console.error('PayloadErrorBoundary caught error:', error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Fallback UI component for render errors
 */
function PayloadRenderErrorFallback({ error }: { error?: Error | null }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-medium text-amber-500">Unable to render event content</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        An error occurred while rendering the event payload. The raw JSON may still be available
        below.
      </p>
      {error && (
        <p className="text-xs text-muted-foreground mt-2 font-mono">Error: {error.message}</p>
      )}
    </div>
  );
}

export interface FilterRequest {
  type: 'topic' | 'source' | 'search';
  value: string;
}

export interface EventDetailPanelProps {
  event: {
    id: string;
    topic: string;
    topicRaw: string;
    eventType: string;
    source: string;
    timestamp: string;
    priority: string;
    correlationId?: string;
    payload?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterRequest?: (filter: FilterRequest) => void;
}

/**
 * EventDetailPanel displays comprehensive information about a selected event.
 *
 * @example
 * ```tsx
 * <EventDetailPanel
 *   event={selectedEvent}
 *   open={isPanelOpen}
 *   onOpenChange={setIsPanelOpen}
 * />
 * ```
 */
export function EventDetailPanel({
  event,
  open,
  onOpenChange,
  onFilterRequest,
}: EventDetailPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  /** Copy a single metadata value to clipboard with toast feedback */
  const handleCopyValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copied', description: `${label} copied to clipboard` });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  /** Apply a filter and close the panel */
  const handleFilter = (filter: FilterRequest) => {
    onFilterRequest?.(filter);
    onOpenChange(false);
    const truncated = filter.value.length > 40 ? filter.value.slice(0, 37) + '...' : filter.value;
    toast({
      title: 'Filter applied',
      description: `Filtered to ${filter.type}=${truncated}`,
    });
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset copied state and parse error when event changes
  useEffect(() => {
    setCopied(false);
    setParseError(null);
  }, [event?.id]);

  // Get topic configuration based on domain
  const topicConfig = useMemo(() => {
    if (!event) return TOPIC_CONFIG.default;
    const domain = getTopicDomain(event.topic);
    return TOPIC_CONFIG[domain] || TOPIC_CONFIG.default;
  }, [event]);

  // Get priority configuration
  const priorityConfig = useMemo(() => {
    if (!event) return PRIORITY_CONFIG.normal;
    return PRIORITY_CONFIG[event.priority.toLowerCase()] || PRIORITY_CONFIG.normal;
  }, [event]);

  // Format the payload (raw)
  const formattedPayload = useMemo(() => {
    if (!event) return '';
    return formatPayload(event.payload);
  }, [event]);

  // Extract parsed details from payload with error handling
  const parsedDetails = useMemo((): ParsedDetails | null => {
    if (!event) return null;
    try {
      const details = extractParsedDetails(event.payload, event.eventType);
      // Validate that the returned details don't contain problematic values
      if (details) {
        // Pre-validate any values that will be used in rendering
        if (details.confidence !== undefined && typeof details.confidence !== 'number') {
          details.confidence = undefined;
        }
        if (details.promptLength !== undefined && typeof details.promptLength !== 'number') {
          details.promptLength = undefined;
        }
        if (details.durationMs !== undefined && typeof details.durationMs !== 'number') {
          details.durationMs = undefined;
        }
      }
      return details;
    } catch (error) {
      // Note: console.error is appropriate here for runtime error logging in catch blocks.
      // Server-side intentLogger is not available in client-side code.
      // Suppressed in production to avoid console noise.
      if (import.meta.env.DEV) {
        console.error('Failed to parse event details:', error);
      }
      setParseError(error instanceof Error ? error.message : 'Unknown parsing error');
      return null;
    }
  }, [event]);

  // Handle copy payload
  const handleCopyPayload = async () => {
    if (!event?.payload) return;

    try {
      await navigator.clipboard.writeText(formattedPayload);
      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, COPY_FEEDBACK_TIMEOUT_MS);

      toast({
        title: 'Copied to clipboard',
        description: 'Event payload has been copied.',
      });
    } catch (error) {
      // Note: console.error is appropriate here for runtime error logging in catch blocks.
      // Server-side intentLogger is not available in client-side code.
      // Suppressed in production to avoid console noise.
      if (import.meta.env.DEV) {
        console.error('Failed to copy:', error);
      }
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Failed to copy payload to clipboard.',
      });
    }
  };

  if (!event) return null;

  const PriorityIcon = priorityConfig.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full">
        <SheetHeader className="flex-shrink-0">
          {/* Event header with topic icon */}
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg p-2.5', topicConfig.bgColor)}>
              <Radio className={cn('h-6 w-6', topicConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold truncate">{event.eventType}</SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono text-xs',
                    topicConfig.bgColor,
                    topicConfig.color,
                    topicConfig.borderColor
                  )}
                >
                  {event.topic}
                </Badge>
              </SheetDescription>
            </div>
          </div>

          {/* Priority and timestamp */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className={cn(priorityConfig.bgColor, 'border-transparent')}>
              <PriorityIcon className={cn('h-3 w-3 mr-1', priorityConfig.color)} />
              <span className={priorityConfig.color}>{priorityConfig.label}</span>
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimestamp(event.timestamp)}
            </span>
          </div>
        </SheetHeader>

        <Separator className="my-4 flex-shrink-0" />

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4">
            {/* Parse error fallback */}
            {parseError && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-medium text-amber-500">
                    Unable to parse event details
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  The event payload could not be fully parsed. The raw JSON is available below.
                </p>
              </div>
            )}

            {/* PAYLOAD CONTENT - Primary focus, wrapped in error boundary */}
            <PayloadErrorBoundary key={event?.id} fallback={<PayloadRenderErrorFallback />}>
              {parsedDetails && !parseError && (
                <div className="space-y-4">
                  {/* Prompt content - most important */}
                  {parsedDetails.prompt && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        Prompt Content
                      </h4>
                      <div className="bg-background rounded-lg p-4 border">
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {parsedDetails.prompt}
                        </p>
                      </div>
                      {parsedDetails.promptLength && (
                        <span className="text-xs text-muted-foreground mt-1 block">
                          {parsedDetails.promptLength.toLocaleString()} characters
                        </span>
                      )}
                    </div>
                  )}

                  {/* Prompt preview (from enrichment, for prompt_event) — OMN-3015 */}
                  {!parsedDetails.prompt && parsedDetails.promptPreview && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        Prompt Preview
                      </h4>
                      <div className="bg-background rounded-lg p-4 border">
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                          {parsedDetails.promptPreview}
                          {parsedDetails.promptPreview.length >= 100 && (
                            <span className="text-xs ml-1 opacity-60">(truncated)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tool Result/Output */}
                  {parsedDetails.toolResult ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Tool Result</h4>
                      <div className="bg-background rounded-lg p-4 border">
                        <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                          {parsedDetails.toolResult}
                        </pre>
                      </div>
                    </div>
                  ) : null}

                  {/* Tool Input */}
                  {parsedDetails.toolInput !== undefined ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Tool Input</h4>
                      <div className="bg-background rounded-lg p-4 border">
                        <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                          {typeof parsedDetails.toolInput === 'string'
                            ? parsedDetails.toolInput
                            : safeJsonStringify(parsedDetails.toolInput)}
                        </pre>
                      </div>
                    </div>
                  ) : null}

                  {/* Generic Result */}
                  {parsedDetails.result !== undefined && !parsedDetails.toolResult ? (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Result</h4>
                      <div className="bg-background rounded-lg p-4 border">
                        <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                          {typeof parsedDetails.result === 'string'
                            ? parsedDetails.result
                            : safeJsonStringify(parsedDetails.result)}
                        </pre>
                      </div>
                    </div>
                  ) : null}

                  {/* Error message */}
                  {parsedDetails.error && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-destructive">Error</h4>
                      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                        <p className="text-sm text-destructive whitespace-pre-wrap break-words">
                          {parsedDetails.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Quick info badges */}
                  {(parsedDetails.actionType ||
                    parsedDetails.actionName ||
                    parsedDetails.toolName ||
                    parsedDetails.agentName) && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {parsedDetails.actionType && (
                        <Badge variant="secondary" className="text-xs">
                          {parsedDetails.actionType}
                        </Badge>
                      )}
                      {parsedDetails.actionName && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {parsedDetails.actionName}
                        </Badge>
                      )}
                      {parsedDetails.toolName && (
                        <Badge variant="outline" className="text-xs font-mono">
                          <Wrench className="h-3 w-3 mr-1" />
                          {parsedDetails.toolName}
                        </Badge>
                      )}
                      {parsedDetails.agentName && (
                        <Badge variant="outline" className="text-xs">
                          <Bot className="h-3 w-3 mr-1" />
                          {parsedDetails.agentName}
                        </Badge>
                      )}
                      {parsedDetails.durationMs && (
                        <Badge variant="outline" className="text-xs">
                          <Timer className="h-3 w-3 mr-1" />
                          {parsedDetails.durationMs}ms
                        </Badge>
                      )}
                      {parsedDetails.confidence !== undefined && (
                        <Badge variant="outline" className="text-xs">
                          <BarChart2 className="h-3 w-3 mr-1" />
                          {safePercentage(parsedDetails.confidence)}
                        </Badge>
                      )}
                      {parsedDetails.status && (
                        <Badge
                          variant={parsedDetails.status === 'error' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {parsedDetails.status}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}
            </PayloadErrorBoundary>

            {/* Event Metadata - Collapsible */}
            <div className="border rounded-lg">
              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Event Metadata
                </span>
                {showMetadata ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {showMetadata && (
                <div className="px-3 pb-3 space-y-2 border-t pt-3">
                  <div className="grid grid-cols-[auto,1fr,auto] gap-x-3 gap-y-2 text-sm items-center">
                    {/* Event ID — always shown */}
                    <span className="text-muted-foreground">Event ID</span>
                    <span className="font-mono truncate">{event.id}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleCopyValue('Event ID', event.id)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>

                    {/* Topic (raw) — always shown */}
                    <span className="text-muted-foreground">Topic</span>
                    <span className="font-mono text-xs break-all">{event.topicRaw}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleCopyValue('Topic', event.topicRaw)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>

                    {/* Source — always shown */}
                    <span className="text-muted-foreground">Source</span>
                    <span className="font-mono">{event.source}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => handleCopyValue('Source', event.source)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>

                    {/* Correlation ID — always shown (N/A if absent) */}
                    <span className="text-muted-foreground">Correlation</span>
                    {event.correlationId ? (
                      <button
                        type="button"
                        className="font-mono truncate text-left text-primary hover:underline cursor-pointer"
                        onClick={() =>
                          handleFilter({ type: 'search', value: event.correlationId! })
                        }
                        title="Click to filter by this correlation ID"
                      >
                        {event.correlationId}
                      </button>
                    ) : (
                      <span className="text-muted-foreground/50 italic">N/A</span>
                    )}
                    {event.correlationId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => handleCopyValue('Correlation ID', event.correlationId!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span />
                    )}

                    {/* Timestamp — always shown */}
                    <span className="text-muted-foreground">Timestamp</span>
                    <span className="font-mono text-xs">{formatTimestamp(event.timestamp)}</span>
                    <span />

                    {/* Session — conditional */}
                    {parsedDetails?.sessionId && (
                      <>
                        <span className="text-muted-foreground">Session</span>
                        <span className="font-mono truncate">{parsedDetails.sessionId}</span>
                        <span />
                      </>
                    )}

                    {/* Node — conditional */}
                    {parsedDetails?.nodeId && (
                      <>
                        <span className="text-muted-foreground">Node</span>
                        <span className="font-mono">{parsedDetails.nodeId}</span>
                        <span />
                      </>
                    )}
                  </div>

                  {/* Quick filter buttons */}
                  {onFilterRequest && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => handleFilter({ type: 'topic', value: event.topicRaw })}
                      >
                        <Filter className="h-3 w-3" />
                        Filter to this topic
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => handleFilter({ type: 'source', value: event.source })}
                      >
                        <Filter className="h-3 w-3" />
                        Filter to this source
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Raw JSON Payload - Collapsible */}
            <div className="border rounded-lg">
              <div className="w-full flex items-center justify-between p-3 text-sm font-medium text-muted-foreground">
                {/* Toggle trigger - only this part is the interactive button */}
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  aria-expanded={showRawJson}
                  aria-controls="raw-json-content"
                  className="flex items-center gap-2 flex-1 hover:text-foreground transition-colors cursor-pointer text-left"
                >
                  <FileJson className="h-4 w-4" />
                  Raw JSON
                  {showRawJson ? (
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  ) : (
                    <ChevronRight className="h-4 w-4 ml-auto" />
                  )}
                </button>
                {/* Copy button - sibling, not nested inside toggle */}
                {event.payload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPayload}
                    className="h-6 px-2 ml-2"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>
              {showRawJson && (
                <div id="raw-json-content" className="border-t">
                  {event.payload ? (
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 max-h-96 overflow-auto">
                      {formattedPayload}
                    </pre>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">No payload data available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default EventDetailPanel;

/**
 * EventDetailPanel Component
 *
 * A slide-out panel showing detailed information about a selected event.
 * Displays event metadata, topic information, and the full JSON payload.
 *
 * Part of the Event Bus monitoring infrastructure.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
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
  Link2,
  Tag,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Copy,
  FileJson,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  Timer,
  BarChart2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
}

// Topic color configuration based on domain
const TOPIC_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  intelligence: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  agent: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  code: {
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  metadata: {
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  database: {
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
  },
  router: {
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
  workflow: {
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
  },
  default: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
  },
};

// Priority configuration
const PRIORITY_CONFIG: Record<
  string,
  { icon: typeof AlertCircle; label: string; color: string; bgColor: string }
> = {
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  high: {
    icon: AlertTriangle,
    label: 'High',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  normal: {
    icon: Info,
    label: 'Normal',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  low: {
    icon: CheckCircle2,
    label: 'Low',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
};

/**
 * Extract domain from topic name for color coding
 */
function getTopicDomain(topic: string): string {
  const lowerTopic = topic.toLowerCase();
  for (const domain of Object.keys(TOPIC_CONFIG)) {
    if (domain !== 'default' && lowerTopic.includes(domain)) {
      return domain;
    }
  }
  return 'default';
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return timestamp;
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return timestamp; // Return original if invalid
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Format JSON payload for display
 */
function formatPayload(payload: string | undefined): string {
  if (!payload) return 'No payload data';

  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // If not valid JSON, return as-is
    return payload;
  }
}

/**
 * Parse payload and extract meaningful fields based on event type
 */
interface ParsedDetails {
  prompt?: string;
  promptLength?: number;
  toolName?: string;
  toolResult?: string;
  toolInput?: unknown;
  durationMs?: number;
  agentName?: string;
  selectedAgent?: string;
  confidence?: number;
  actionType?: string;
  actionName?: string;
  sessionId?: string;
  nodeId?: string;
  status?: string;
  error?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Recursively search for a key in an object (handles nested payloads)
 */
function findValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  // Search one level deep in common wrapper fields
  for (const wrapper of [
    'payload',
    'data',
    'body',
    'content',
    'details',
    'actionDetails',
    'action_details',
  ]) {
    if (obj[wrapper] && typeof obj[wrapper] === 'object') {
      const nested = obj[wrapper] as Record<string, unknown>;
      for (const key of keys) {
        if (nested[key] !== undefined) return nested[key];
      }
    }
  }
  return undefined;
}

function extractParsedDetails(
  payload: string | undefined,
  eventType: string
): ParsedDetails | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const details: ParsedDetails = {};

    // Extract prompt with deep search
    const prompt = findValue(parsed, [
      'prompt',
      'prompt_preview',
      'promptPreview',
      'user_prompt',
      'userPrompt',
      'input',
      'query',
      'message',
    ]);
    if (prompt && typeof prompt === 'string') {
      details.prompt = prompt;
    }

    // Prompt length
    const promptLength = findValue(parsed, ['prompt_length', 'promptLength', 'length']);
    if (typeof promptLength === 'number') {
      details.promptLength = promptLength;
    }

    // Tool information
    const toolName = findValue(parsed, [
      'tool_name',
      'toolName',
      'tool',
      'function_name',
      'functionName',
    ]);
    if (toolName && typeof toolName === 'string') {
      details.toolName = toolName;
    }

    const toolInput = findValue(parsed, [
      'tool_input',
      'toolInput',
      'input',
      'parameters',
      'args',
      'arguments',
    ]);
    if (toolInput !== undefined) {
      details.toolInput = toolInput;
    }

    const toolResult = findValue(parsed, ['tool_result', 'toolResult', 'output', 'response']);
    if (toolResult !== undefined) {
      details.toolResult =
        typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
    }

    // Duration
    const duration = findValue(parsed, [
      'duration_ms',
      'durationMs',
      'duration',
      'elapsed_ms',
      'latency_ms',
    ]);
    if (typeof duration === 'number') {
      details.durationMs = duration;
    }

    // Agent info
    const agentName = findValue(parsed, ['agent_name', 'agentName', 'agent']);
    if (agentName && typeof agentName === 'string') {
      details.agentName = agentName;
    }

    const selectedAgent = findValue(parsed, ['selected_agent', 'selectedAgent']);
    if (selectedAgent && typeof selectedAgent === 'string') {
      details.selectedAgent = selectedAgent;
    }

    const confidence = findValue(parsed, ['confidence', 'confidence_score', 'score']);
    if (typeof confidence === 'number') {
      details.confidence = confidence;
    }

    // Action info
    const actionType = findValue(parsed, ['action_type', 'actionType', 'type']);
    if (actionType && typeof actionType === 'string') {
      details.actionType = actionType;
    }

    const actionName = findValue(parsed, ['action_name', 'actionName', 'name', 'action']);
    if (actionName && typeof actionName === 'string') {
      details.actionName = actionName;
    }

    // Session/Node info
    const sessionId = findValue(parsed, ['session_id', 'sessionId']);
    if (sessionId && typeof sessionId === 'string') {
      details.sessionId = sessionId;
    }

    const nodeId = findValue(parsed, ['node_id', 'nodeId']);
    if (nodeId && typeof nodeId === 'string') {
      details.nodeId = nodeId;
    }

    // Status/Errors
    const status = findValue(parsed, ['status', 'state']);
    if (status && typeof status === 'string') {
      details.status = status;
    }

    const error = findValue(parsed, ['error', 'error_message', 'errorMessage', 'message']);
    if (
      error &&
      typeof error === 'string' &&
      (parsed.status === 'error' ||
        parsed.error ||
        eventType.includes('error') ||
        eventType.includes('fail'))
    ) {
      details.error = error;
    }

    // Generic result
    const result = findValue(parsed, ['result', 'data', 'response']);
    if (result !== undefined && !details.toolResult) {
      details.result = result;
    }

    return Object.keys(details).length > 0 ? details : null;
  } catch {
    return null;
  }
}

/**
 * Extract only the meaningful payload content, stripping wrapper metadata
 */
function getCleanPayload(payload: string | undefined): Record<string, unknown> | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;

    // Fields that are already shown in the header/metadata section
    const metadataFields = new Set([
      'id',
      'eventId',
      'event_id',
      'correlationId',
      'correlation_id',
      'timestamp',
      'created_at',
      'createdAt',
      'source',
      'topic',
      'topicRaw',
      'priority',
      'version',
      'schemaVersion',
    ]);

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!metadataFields.has(key)) {
        clean[key] = value;
      }
    }

    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
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
export function EventDetailPanel({ event, open, onOpenChange }: EventDetailPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset copied state when event changes
  useEffect(() => {
    setCopied(false);
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

  // Get clean payload (without metadata fields)
  const cleanPayload: Record<string, unknown> | null = useMemo(() => {
    if (!event) return null;
    return getCleanPayload(event.payload);
  }, [event]);

  // Extract parsed details from payload
  const parsedDetails = useMemo((): ParsedDetails | null => {
    if (!event) return null;
    return extractParsedDetails(event.payload, event.eventType);
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
      }, 2000);

      toast({
        title: 'Copied to clipboard',
        description: 'Event payload has been copied.',
      });
    } catch (error) {
      console.error('Failed to copy:', error);
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
            {/* PAYLOAD CONTENT - Primary focus */}
            {parsedDetails && (
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
                          : JSON.stringify(parsedDetails.toolInput, null, 2)}
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
                          : JSON.stringify(parsedDetails.result, null, 2)}
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
                        {(parsedDetails.confidence * 100).toFixed(0)}%
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

            {/* Clean Payload - when no parsed details or additional data */}
            {cleanPayload && !parsedDetails?.prompt && !parsedDetails?.toolResult && (
              <div>
                <h4 className="text-sm font-medium mb-2">Payload Content</h4>
                <div className="bg-background rounded-lg p-4 border">
                  <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                    {JSON.stringify(cleanPayload, null, 2)}
                  </pre>
                </div>
              </div>
            )}

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
                  <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Event ID</span>
                    <span className="font-mono truncate">{event.id}</span>

                    <span className="text-muted-foreground">Source</span>
                    <span className="font-mono">{event.source}</span>

                    <span className="text-muted-foreground">Topic</span>
                    <span className="font-mono text-xs break-all">{event.topicRaw}</span>

                    {event.correlationId && (
                      <>
                        <span className="text-muted-foreground">Correlation</span>
                        <span className="font-mono truncate">{event.correlationId}</span>
                      </>
                    )}

                    {parsedDetails?.sessionId && (
                      <>
                        <span className="text-muted-foreground">Session</span>
                        <span className="font-mono truncate">{parsedDetails.sessionId}</span>
                      </>
                    )}

                    {parsedDetails?.nodeId && (
                      <>
                        <span className="text-muted-foreground">Node</span>
                        <span className="font-mono">{parsedDetails.nodeId}</span>
                      </>
                    )}
                  </div>
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

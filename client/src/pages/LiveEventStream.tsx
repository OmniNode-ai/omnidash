/**
 * Live Event Stream - Investor Demo Component (OMN-1405)
 *
 * Real-time visualization of Kafka events flowing through the OmniNode platform.
 * Designed for investor demos with focus on decision-making events.
 *
 * Features:
 * - WebSocket subscription to routing + transformation events
 * - Animated "LIVE" indicator
 * - Pause/Resume controls
 * - Filter presets (decision-focused vs all actions)
 * - Right-side drawer for event details
 * - Optional subtle audio notifications
 * - 100 event buffer (hard cap)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  Zap,
  GitBranch,
  Gauge,
  Activity,
  ChevronRight,
  Clock,
  Server,
  Brain,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EVENTS = 100;

const FILTER_PRESETS = {
  decisions: {
    label: 'Decisions & Transforms',
    topics: ['routing', 'transformations'],
    description: 'AI decision-making and adaptive behavior',
  },
  actions: {
    label: 'Agent Actions',
    topics: ['actions'],
    description: 'Tool calls: Read, Edit, Bash, etc.',
  },
  all: {
    label: 'All Events',
    topics: ['all'],
    description: 'Everything flowing through the system',
  },
  performance: {
    label: 'Performance',
    topics: ['performance'],
    description: 'Routing latency and cache metrics',
  },
} as const;

type FilterPreset = keyof typeof FILTER_PRESETS;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  data: {
    id?: string;
    correlationId?: string;
    // Routing decision fields
    selectedAgent?: string;
    confidenceScore?: number;
    userRequest?: string;
    routingStrategy?: string;
    routingTimeMs?: number;
    reasoning?: string;
    alternatives?: Record<string, unknown>;
    // Agent action fields
    agentName?: string;
    actionType?: string;
    actionName?: string;
    actionDetails?: Record<string, unknown>;
    durationMs?: number;
    // Transformation fields
    sourceAgent?: string;
    targetAgent?: string;
    transformationDurationMs?: number;
    success?: boolean;
    // Performance fields
    queryText?: string;
    routingDurationMs?: number;
    cacheHit?: boolean;
    candidatesEvaluated?: number;
    // Generic
    [key: string]: unknown;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function getEventIcon(type: string) {
  if (type.includes('ROUTING')) return Brain;
  if (type.includes('TRANSFORMATION')) return GitBranch;
  if (type.includes('ACTION')) return Zap;
  if (type.includes('PERFORMANCE')) return Gauge;
  return Activity;
}

function getEventColor(type: string): string {
  if (type.includes('ROUTING')) return 'text-blue-500';
  if (type.includes('TRANSFORMATION')) return 'text-purple-500';
  if (type.includes('ACTION')) return 'text-green-500';
  if (type.includes('PERFORMANCE')) return 'text-orange-500';
  if (type.includes('ERROR')) return 'text-red-500';
  return 'text-muted-foreground';
}

function getEventBorderColor(type: string): string {
  if (type.includes('ROUTING')) return 'border-l-blue-500';
  if (type.includes('TRANSFORMATION')) return 'border-l-purple-500';
  if (type.includes('ACTION')) return 'border-l-green-500';
  if (type.includes('PERFORMANCE')) return 'border-l-orange-500';
  if (type.includes('ERROR')) return 'border-l-red-500';
  return 'border-l-muted';
}

function formatTimestamp(timestamp: string): string {
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

function getEventSummary(event: LiveEvent): string {
  const { type, data } = event;

  if (type === 'ROUTING_DECISION') {
    const confidence = data.confidenceScore ? `${(data.confidenceScore * 100).toFixed(0)}%` : '';
    return `→ ${data.selectedAgent || 'unknown'} ${confidence}`;
  }

  if (type === 'AGENT_TRANSFORMATION') {
    return `${data.sourceAgent || '?'} → ${data.targetAgent || '?'}`;
  }

  if (type === 'AGENT_ACTION') {
    const action = data.actionName || data.actionType || 'action';
    return `${data.agentName || 'agent'}: ${action}`;
  }

  if (type === 'PERFORMANCE_METRIC') {
    const duration = data.routingDurationMs || data.durationMs;
    const cache = data.cacheHit ? '(cached)' : '';
    return `${duration ? `${duration}ms` : ''} ${cache}`.trim() || 'metric';
  }

  return type.replace(/_/g, ' ').toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Hook
// ─────────────────────────────────────────────────────────────────────────────

function useAudioNotification() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotification = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Subtle, short blip
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.05, ctx.currentTime); // Very quiet
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio not supported or blocked
    }
  }, []);

  return { playNotification };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────

interface EventDetailDrawerProps {
  event: LiveEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EventDetailDrawer({ event, open, onOpenChange }: EventDetailDrawerProps) {
  if (!event) return null;

  const Icon = getEventIcon(event.type);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon className={cn('w-5 h-5', getEventColor(event.type))} />
            {event.type.replace(/_/g, ' ')}
          </SheetTitle>
          <SheetDescription>
            {formatTimestamp(event.timestamp)}
            {event.data.correlationId && (
              <span className="ml-2 font-mono text-xs">
                ID: {event.data.correlationId.slice(0, 8)}...
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Summary Section */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Summary
            </h4>
            <p className="text-lg font-semibold">{getEventSummary(event)}</p>
          </div>

          {/* Key Details */}
          {event.type === 'ROUTING_DECISION' && (
            <div className="space-y-4">
              <DetailRow label="Selected Agent" value={event.data.selectedAgent} />
              <DetailRow
                label="Confidence"
                value={
                  event.data.confidenceScore
                    ? `${(event.data.confidenceScore * 100).toFixed(1)}%`
                    : undefined
                }
              />
              <DetailRow label="Strategy" value={event.data.routingStrategy} />
              <DetailRow
                label="Routing Time"
                value={event.data.routingTimeMs ? `${event.data.routingTimeMs}ms` : undefined}
              />
              {event.data.userRequest && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    User Request
                  </span>
                  <p className="text-sm bg-muted p-3 rounded-lg font-mono">
                    {String(event.data.userRequest).slice(0, 200)}
                    {String(event.data.userRequest).length > 200 && '...'}
                  </p>
                </div>
              )}
              {event.data.reasoning && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Reasoning
                  </span>
                  <p className="text-sm bg-muted p-3 rounded-lg">{String(event.data.reasoning)}</p>
                </div>
              )}
            </div>
          )}

          {event.type === 'AGENT_TRANSFORMATION' && (
            <div className="space-y-4">
              <DetailRow label="Source Agent" value={event.data.sourceAgent} />
              <DetailRow label="Target Agent" value={event.data.targetAgent} />
              <DetailRow
                label="Duration"
                value={
                  event.data.transformationDurationMs
                    ? `${event.data.transformationDurationMs}ms`
                    : undefined
                }
              />
              <DetailRow
                label="Success"
                value={
                  event.data.success !== undefined ? (event.data.success ? 'Yes' : 'No') : undefined
                }
              />
              <DetailRow
                label="Confidence"
                value={
                  event.data.confidenceScore
                    ? `${(event.data.confidenceScore * 100).toFixed(1)}%`
                    : undefined
                }
              />
            </div>
          )}

          {event.type === 'AGENT_ACTION' && (
            <div className="space-y-4">
              <DetailRow label="Agent" value={event.data.agentName} />
              <DetailRow label="Action Type" value={event.data.actionType} />
              <DetailRow label="Action Name" value={event.data.actionName} />
              <DetailRow
                label="Duration"
                value={event.data.durationMs ? `${event.data.durationMs}ms` : undefined}
              />
            </div>
          )}

          {event.type === 'PERFORMANCE_METRIC' && (
            <div className="space-y-4">
              <DetailRow
                label="Routing Duration"
                value={
                  event.data.routingDurationMs ? `${event.data.routingDurationMs}ms` : undefined
                }
              />
              <DetailRow
                label="Cache Hit"
                value={
                  event.data.cacheHit !== undefined
                    ? event.data.cacheHit
                      ? 'Yes'
                      : 'No'
                    : undefined
                }
              />
              <DetailRow
                label="Candidates Evaluated"
                value={event.data.candidatesEvaluated?.toString()}
              />
            </div>
          )}

          {/* Full Payload */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Full Payload
            </h4>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LiveEventStream() {
  // State
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('decisions');
  const [selectedEvent, setSelectedEvent] = useState<LiveEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { playNotification } = useAudioNotification();

  // WebSocket message handler
  const handleMessage = useCallback(
    (message: { type: string; data?: unknown; timestamp: string }) => {
      if (isPaused) return;

      // Only process event types we care about
      const validTypes = [
        'ROUTING_DECISION',
        'AGENT_ACTION',
        'AGENT_TRANSFORMATION',
        'PERFORMANCE_METRIC',
        'AGENT_METRIC_UPDATE',
      ];

      if (!validTypes.includes(message.type)) return;

      const newEvent: LiveEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: message.type,
        timestamp: message.timestamp,
        data: (message.data as LiveEvent['data']) || {},
      };

      setEvents((prev) => [newEvent, ...prev].slice(0, MAX_EVENTS));
      setEventCount((prev) => prev + 1);

      if (audioEnabled) {
        playNotification();
      }
    },
    [isPaused, audioEnabled, playNotification]
  );

  // WebSocket connection
  const { isConnected, connectionStatus, subscribe, reconnect } = useWebSocket({
    onMessage: handleMessage,
    debug: false,
  });

  // Subscribe to topics when connected or filter changes
  useEffect(() => {
    if (isConnected) {
      const topics = [...FILTER_PRESETS[filterPreset].topics];
      subscribe(topics);
    }
  }, [isConnected, filterPreset, subscribe]);

  // Handle event click
  const handleEventClick = (event: LiveEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  // Clear events
  const handleClear = () => {
    setEvents([]);
    setEventCount(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Event Stream</h1>
          <p className="text-muted-foreground">
            Real-time events flowing through the OmniNode platform
          </p>
        </div>

        {/* Live Badge */}
        {isConnected && !isPaused && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1.5 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-100" />
            </span>
            LIVE
          </Badge>
        )}

        {isPaused && (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Pause className="w-3 h-3" />
            PAUSED
          </Badge>
        )}

        {!isConnected && (
          <Badge variant="destructive" className="gap-1.5 px-3 py-1">
            <Activity className="w-3 h-3" />
            {connectionStatus === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
          </Badge>
        )}
      </div>

      {/* Controls Card */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Filter Preset */}
          <div className="flex items-center gap-2">
            <Label htmlFor="filter-preset" className="text-sm whitespace-nowrap">
              Show:
            </Label>
            <Select
              value={filterPreset}
              onValueChange={(value) => setFilterPreset(value as FilterPreset)}
            >
              <SelectTrigger id="filter-preset" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FILTER_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{preset.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Pause/Resume */}
          <Button
            variant={isPaused ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </>
            )}
          </Button>

          {/* Clear */}
          <Button variant="outline" size="sm" onClick={handleClear}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Clear
          </Button>

          <div className="h-6 w-px bg-border" />

          {/* Audio Toggle */}
          <div className="flex items-center gap-2">
            <Switch id="audio-toggle" checked={audioEnabled} onCheckedChange={setAudioEnabled} />
            <Label htmlFor="audio-toggle" className="flex items-center gap-1 cursor-pointer">
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              ) : (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">Audio</span>
            </Label>
          </div>

          <div className="flex-1" />

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              <span>{events.length} in buffer</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{eventCount} total</span>
            </div>
          </div>

          {/* Reconnect if disconnected */}
          {!isConnected && connectionStatus !== 'connecting' && (
            <Button variant="outline" size="sm" onClick={reconnect}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Reconnect
            </Button>
          )}
        </div>

        {/* Filter Description */}
        <p className="text-xs text-muted-foreground mt-3">
          {FILTER_PRESETS[filterPreset].description}
        </p>
      </Card>

      {/* Event Stream */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Event Feed</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Topics: {FILTER_PRESETS[filterPreset].topics.join(', ')}
            </span>
          </div>
        </div>

        <ScrollArea className="h-[600px]" ref={scrollRef}>
          <div className="divide-y divide-border">
            {events.length === 0 ? (
              <div className="p-12 text-center">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {isConnected
                    ? 'Waiting for events...'
                    : connectionStatus === 'connecting'
                      ? 'Connecting to event stream...'
                      : 'Disconnected from event stream'}
                </p>
                {!isConnected && connectionStatus !== 'connecting' && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={reconnect}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Reconnect
                  </Button>
                )}
              </div>
            ) : (
              events.map((event, index) => {
                const Icon = getEventIcon(event.type);
                return (
                  <div
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors',
                      'hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
                      'border-l-4',
                      getEventBorderColor(event.type),
                      index < 10 && 'animate-slide-in'
                    )}
                    style={index < 10 ? { animationDelay: `${index * 30}ms` } : undefined}
                    onClick={() => handleEventClick(event)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEventClick(event);
                      }
                    }}
                  >
                    {/* Timestamp */}
                    <span className="text-xs font-mono text-muted-foreground w-24 shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>

                    {/* Event Type Badge */}
                    <div className="flex items-center gap-2 w-48 shrink-0">
                      <Icon className={cn('w-4 h-4', getEventColor(event.type))} />
                      <Badge variant="outline" className="text-xs font-mono">
                        {event.type.replace(/_/g, '-').toLowerCase()}
                      </Badge>
                    </div>

                    {/* Summary */}
                    <span className="text-sm flex-1 truncate">{getEventSummary(event)}</span>

                    {/* Correlation ID hint */}
                    {event.data.correlationId && (
                      <span className="text-xs font-mono text-muted-foreground/60 hidden lg:inline">
                        {String(event.data.correlationId).slice(0, 8)}
                      </span>
                    )}

                    {/* Chevron */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-blue-500" />
          <span>Routing Decision</span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-purple-500" />
          <span>Transformation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-green-500" />
          <span>Agent Action</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-orange-500" />
          <span>Performance</span>
        </div>
      </div>

      {/* Event Detail Drawer */}
      <EventDetailDrawer event={selectedEvent} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

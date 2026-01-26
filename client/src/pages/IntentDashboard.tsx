/**
 * Intent Dashboard Page (OMN-1458)
 *
 * Real-time Intent Classification Dashboard that combines:
 * - IntentDistribution: Bar chart showing category distribution
 * - RecentIntents: Streaming list of recent classifications
 * - SessionTimeline: Chronological timeline visualization
 *
 * Features:
 * - WebSocket-based live updates
 * - Animated connection status indicator
 * - Responsive grid layout
 * - Time range selector
 * - Stats summary cards
 */

import { useState, useMemo } from 'react';
import { IntentDistribution, RecentIntents, SessionTimeline } from '@/components/intent';
import { useIntentStream } from '@/hooks/useIntentStream';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardPageHeader } from '@/components/DashboardPageHeader';
import { cn } from '@/lib/utils';
import { CONFIDENCE_THRESHOLD_HIGH, CONFIDENCE_THRESHOLD_MEDIUM } from '@/lib/intent-colors';
import {
  Brain,
  Activity,
  TrendingUp,
  Clock,
  BarChart3,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import React from 'react';
import type { IntentItem } from '@/components/intent';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Available time range options for filtering */
const TIME_RANGE_OPTIONS = [
  { value: '1', label: 'Last 1 hour' },
  { value: '6', label: 'Last 6 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
] as const;

type TimeRangeHours = (typeof TIME_RANGE_OPTIONS)[number]['value'];

// ─────────────────────────────────────────────────────────────────────────────
// Error Boundary Component
// ─────────────────────────────────────────────────────────────────────────────

interface IntentErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface IntentErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary for Intent Dashboard visualization components.
 * Catches errors from child components and displays a user-friendly fallback UI.
 */
class IntentErrorBoundary extends React.Component<
  IntentErrorBoundaryProps,
  IntentErrorBoundaryState
> {
  constructor(props: IntentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): IntentErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[IntentDashboard] Component error:', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Card className="h-full">
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Failed to load {this.props.fallbackTitle || 'component'}
            </p>
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card Component
// ─────────────────────────────────────────────────────────────────────────────

// Note: This component is similar to MetricCard from @/components/MetricCard.
// StatCard provides an always-visible `description` field, whereas MetricCard
// uses a `tooltip` for additional context. StatCard is preferred here for UX
// where the description text should be immediately visible without hover.

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

function StatCard({ title, value, description, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {trend && (
            <TrendingUp
              className={cn(
                'h-4 w-4',
                trend === 'up' && 'text-green-500',
                trend === 'down' && 'text-red-500 rotate-180',
                trend === 'neutral' && 'text-muted-foreground'
              )}
            />
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detail Sheet
// ─────────────────────────────────────────────────────────────────────────────

interface IntentDetailProps {
  intent: IntentItem | null;
  onClose: () => void;
}

/**
 * Sheet component for displaying detailed intent information.
 * Slides in from the right when an intent is selected.
 * Automatically handles:
 * - Escape key to close
 * - Click outside to close
 * - Focus management
 */
function IntentDetail({ intent, onClose }: IntentDetailProps) {
  return (
    <Sheet open={!!intent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-96 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Intent Details</SheetTitle>
          {intent && (
            <SheetDescription>Classification details for {intent.intent_category}</SheetDescription>
          )}
        </SheetHeader>
        {intent && (
          <div className="space-y-4 mt-6 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Category:</span>
              <Badge variant="outline">{intent.intent_category}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Confidence:</span>
              <span className="font-mono">{(intent.confidence * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Session:</span>
              <span className="font-mono text-xs truncate max-w-[180px]">{intent.session_ref}</span>
            </div>
            {intent.keywords && intent.keywords.length > 0 && (
              <div>
                <span className="text-muted-foreground">Keywords:</span>
                <div className="flex flex-wrap gap-1 mt-2">
                  {intent.keywords.slice(0, 5).map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function IntentDashboard() {
  // State
  const [timeRange, setTimeRange] = useState<TimeRangeHours>('24');
  const [selectedIntent, setSelectedIntent] = useState<IntentItem | null>(null);

  // Use the intent stream for live connection status and data
  // Note: stats.byCategory and distribution contain identical data; we use stats.byCategory
  // to avoid redundant destructuring. Consider consolidating in useIntentStream if needed.
  const { intents, isConnected, connectionStatus, stats, clearIntents } = useIntentStream({
    maxItems: 100,
    autoConnect: true,
  });

  // Compute derived stats using stats.byCategory (equivalent to distribution)
  const categoryCount = useMemo(() => Object.keys(stats.byCategory).length, [stats.byCategory]);

  const avgConfidence = useMemo(() => {
    if (intents.length === 0) return 0;
    const total = intents.reduce((sum, intent) => sum + intent.confidence, 0);
    return total / intents.length;
  }, [intents]);

  const lastEventTimeStr = useMemo(() => {
    if (!stats.lastEventTime) return 'No events yet';
    return stats.lastEventTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [stats.lastEventTime]);

  // Handlers
  const handleIntentClick = (intent: IntentItem) => {
    setSelectedIntent(intent);
  };

  const handleClearIntents = () => {
    clearIntents();
    setSelectedIntent(null);
  };

  const timeRangeHours = parseInt(timeRange, 10);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="Intent Classification Dashboard"
          description="Real-time classification of user intents across sessions"
          isConnected={isConnected}
          connectionStatus={connectionStatus}
          lastUpdated={stats.lastEventTime}
          actions={
            <div className="flex items-center gap-2">
              {/* Time Range Selector */}
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRangeHours)}>
                <SelectTrigger className="w-[140px]">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Clear Button */}
              <Button variant="outline" size="sm" onClick={handleClearIntents} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </div>
          }
        />

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Intents"
            value={stats.totalReceived}
            description="Since page load"
            icon={Brain}
            trend={stats.totalReceived > 0 ? 'up' : 'neutral'}
          />
          <StatCard
            title="Categories"
            value={categoryCount}
            description="Unique categories detected"
            icon={BarChart3}
          />
          <StatCard
            title="Avg Confidence"
            value={`${(avgConfidence * 100).toFixed(1)}%`}
            description="Mean classification score"
            icon={TrendingUp}
            trend={
              avgConfidence >= CONFIDENCE_THRESHOLD_HIGH
                ? 'up'
                : avgConfidence >= CONFIDENCE_THRESHOLD_MEDIUM
                  ? 'neutral'
                  : 'down'
            }
          />
          <StatCard
            title="Last Event"
            value={lastEventTimeStr}
            description="Most recent classification"
            icon={Activity}
          />
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column: Distribution Chart (~40% width on lg) */}
          <div className="lg:col-span-2">
            <IntentErrorBoundary fallbackTitle="intent distribution">
              <IntentDistribution
                timeRangeHours={timeRangeHours}
                refreshInterval={30000}
                title={`Intent Distribution (${TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label})`}
                className="h-full"
              />
            </IntentErrorBoundary>
          </div>

          {/* Right Column: Recent Intents (~60% width on lg) */}
          <div className="lg:col-span-3">
            <IntentErrorBoundary fallbackTitle="recent intents">
              <RecentIntents
                limit={50}
                showConfidence={true}
                maxHeight={400}
                onIntentClick={handleIntentClick}
                className="h-full"
              />
            </IntentErrorBoundary>
          </div>
        </div>

        {/* Session Timeline (Full Width) */}
        <IntentErrorBoundary fallbackTitle="session timeline">
          <SessionTimeline
            maxHeight={350}
            showCard={true}
            refetchInterval={30000}
            defaultView="chart"
            showViewToggle={true}
            onIntentClick={handleIntentClick}
          />
        </IntentErrorBoundary>

        {/* Legend - thresholds from shared constants (intent-colors.ts) */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>High confidence (&ge;{Math.round(CONFIDENCE_THRESHOLD_HIGH * 100)}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>
              Medium confidence ({Math.round(CONFIDENCE_THRESHOLD_MEDIUM * 100)}-
              {Math.round(CONFIDENCE_THRESHOLD_HIGH * 100)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Low confidence (&lt;{Math.round(CONFIDENCE_THRESHOLD_MEDIUM * 100)}%)</span>
          </div>
        </div>

        {/* Intent Detail Sheet */}
        <IntentDetail intent={selectedIntent} onClose={() => setSelectedIntent(null)} />
      </div>
    </TooltipProvider>
  );
}

import { useState, useCallback, useMemo } from 'react';
import { startOfDay, endOfDay, isToday, isFuture } from 'date-fns';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { DatePicker } from '@/components/ui/date-picker';
import { RoutingTimelineView, formatDuration } from '@/components/routing/RoutingTimelineView';
import { RoutingAggregateView } from '@/components/routing/RoutingAggregateView';

// =============================================================================
// CONSTANTS
// =============================================================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULT_VISIBLE_DURATION = 10 * MINUTE;

function timeRangeToMs(timeRange: string): number {
  switch (timeRange) {
    case '1h':
      return HOUR;
    case '24h':
      return DAY;
    case '7d':
      return 7 * DAY;
    case '30d':
      return 30 * DAY;
    case '90d':
      return 90 * DAY;
    default:
      return DAY;
  }
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function RoutingDecisions() {
  // Time range selection
  const [timeRange, setTimeRange] = useState('24h');
  const [visibleDuration, setVisibleDuration] = useState(DEFAULT_VISIBLE_DURATION);

  // Selected date for timeline view (defaults to today)
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Determine if we should show the timeline view (1h, 24h) or aggregate view (7d, 30d, 90d)
  const isTimelineView = timeRange === '1h' || timeRange === '24h';

  // Calculate data boundaries based on time range and selected date
  const { dataStartTime, dataEndTime } = useMemo(() => {
    if (isTimelineView) {
      // For timeline views, use the selected date
      const dayStart = startOfDay(selectedDate).getTime();
      const dayEnd = endOfDay(selectedDate).getTime();

      if (timeRange === '1h') {
        // For 1h view, if today show last hour from now, otherwise show last hour of the day
        if (isToday(selectedDate)) {
          const now = Date.now();
          return {
            dataStartTime: now - HOUR,
            dataEndTime: now,
          };
        } else {
          // Show the last hour of the selected day
          return {
            dataStartTime: dayEnd - HOUR,
            dataEndTime: dayEnd,
          };
        }
      } else {
        // For 24h view, show the full day
        // If today, end at current time; otherwise end at end of day
        if (isToday(selectedDate)) {
          return {
            dataStartTime: dayStart,
            dataEndTime: Date.now(),
          };
        } else {
          return {
            dataStartTime: dayStart,
            dataEndTime: dayEnd,
          };
        }
      }
    } else {
      // For aggregate views, use relative time from now
      const end = Date.now();
      const duration = timeRangeToMs(timeRange);
      return {
        dataEndTime: end,
        dataStartTime: end - duration,
      };
    }
  }, [timeRange, selectedDate, isTimelineView]);

  const handleTimeRangeChange = useCallback((newRange: string) => {
    setTimeRange(newRange);
    setVisibleDuration(DEFAULT_VISIBLE_DURATION);
    // Reset to today when switching time ranges
    setSelectedDate(new Date());
  }, []);

  const handleDateChange = useCallback((date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setVisibleDuration(DEFAULT_VISIBLE_DURATION);
    }
  }, []);

  // Disable future dates in the date picker
  const disableFutureDates = useCallback((date: Date) => {
    return isFuture(date);
  }, []);

  const handleZoomIn = useCallback(() => {
    setVisibleDuration((prev) => Math.max(MINUTE, prev * 0.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setVisibleDuration((prev) => Math.min(24 * HOUR, prev * 2));
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Routing Decisions</h1>
          <p className="text-muted-foreground">
            Real-time agent routing intelligence and decision analysis
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          {isTimelineView && (
            <>
              <DatePicker
                date={selectedDate}
                onDateChange={handleDateChange}
                disabled={disableFutureDates}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {formatDuration(visibleDuration)}
                </span>
                <Button variant="outline" size="icon" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* View Component */}
      {isTimelineView ? (
        <RoutingTimelineView
          dataStartTime={dataStartTime}
          dataEndTime={dataEndTime}
          visibleDuration={visibleDuration}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      ) : (
        <RoutingAggregateView
          timeRange={timeRange as '7d' | '30d' | '90d'}
          dataStartTime={dataStartTime}
          dataEndTime={dataEndTime}
        />
      )}
    </div>
  );
}

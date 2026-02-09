/**
 * TopicSelector Component
 *
 * Always-visible navigation pane for selecting Kafka topics in the Event Bus
 * Monitor. Fixed height, overflow-contained, no collapsing.
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface TopicStatusRow {
  topic: string;
  label: string;
  category: string;
  eventCount: number;
  lastEventAt: string | null;
  lastEventFormatted: string;
  status: 'active' | 'silent' | 'error';
}

export interface TopicSelectorProps {
  topics: TopicStatusRow[];
  selectedTopic: string | null;
  onSelectTopic: (topic: string | null) => void;
}

type FilterMode = 'all' | 'active' | 'silent';

const STATUS_DOT: Record<TopicStatusRow['status'], { color: string; pulse: boolean }> = {
  active: { color: 'bg-emerald-500', pulse: true },
  silent: { color: 'bg-zinc-500/50', pulse: false },
  error: { color: 'bg-red-500', pulse: true },
};

export function TopicSelector({ topics, selectedTopic, onSelectTopic }: TopicSelectorProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  const activeCount = useMemo(() => topics.filter((t) => t.status === 'active').length, [topics]);
  const silentCount = useMemo(() => topics.filter((t) => t.status === 'silent').length, [topics]);

  const filteredTopics = useMemo(() => {
    if (filter === 'all') return topics;
    return topics.filter((t) => t.status === filter);
  }, [topics, filter]);

  const handleRowClick = (topic: string) => {
    onSelectTopic(selectedTopic === topic ? null : topic);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden flex flex-col h-full">
      {/* Row 1: Title + status counts */}
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Topics
        </span>
        <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
          {activeCount}
        </span>
        <span className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500/50 inline-block" />
          {silentCount}
        </span>
      </div>

      {/* Row 2: Filter toggle pills */}
      <div className="flex items-center px-3 pb-2 shrink-0">
        <div className="flex items-center gap-0.5 rounded-md bg-background/50 p-0.5">
          {(
            [
              { mode: 'all' as const, label: 'All', count: topics.length },
              { mode: 'active' as const, label: 'Active', count: activeCount },
              { mode: 'silent' as const, label: 'Silent', count: silentCount },
            ] as const
          ).map(({ mode, label, count }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              className={cn(
                'h-5 px-2 text-[10px] font-medium rounded-sm',
                filter === mode && 'bg-background shadow-sm text-foreground',
                filter !== mode && 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setFilter(mode)}
            >
              {label}
              <span className="ml-1 opacity-60">({count})</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Topic list — scrollable, fills remaining space */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-0.5 border-t border-border/40">
          {filteredTopics.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-muted-foreground italic">
              No {filter} topics
            </p>
          ) : (
            filteredTopics.map((row) => {
              const isSelected = selectedTopic === row.topic;
              const dot = STATUS_DOT[row.status];

              return (
                <button
                  key={row.topic}
                  type="button"
                  title={row.topic}
                  onClick={() => handleRowClick(row.topic)}
                  className={cn(
                    'w-full grid grid-cols-[8px_1fr_auto_auto] items-center gap-x-2 h-7 px-3 cursor-pointer transition-all text-left',
                    'border-l-[3px]',
                    'hover:bg-accent/40',
                    isSelected && 'border-l-primary bg-accent/60',
                    !isSelected && 'border-l-transparent'
                  )}
                >
                  {/* Status dot */}
                  <span className="relative flex h-2 w-2 shrink-0">
                    {dot.pulse && (
                      <span
                        className={cn(
                          'absolute inset-0 rounded-full opacity-40 animate-ping',
                          dot.color
                        )}
                      />
                    )}
                    <span className={cn('relative h-2 w-2 rounded-full', dot.color)} />
                  </span>

                  {/* Topic name */}
                  <span
                    className={cn(
                      'text-[12px] truncate',
                      isSelected ? 'font-semibold text-foreground' : 'font-medium'
                    )}
                  >
                    {row.label}
                  </span>

                  {/* Event count */}
                  <span
                    className={cn(
                      'text-[11px] tabular-nums font-medium min-w-[3ch] text-right',
                      row.eventCount > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                    )}
                  >
                    {row.eventCount > 0 ? row.eventCount.toLocaleString() : '\u2014'}
                  </span>

                  {/* Last seen */}
                  <span className="text-[10px] text-muted-foreground/60 w-[52px] text-right whitespace-nowrap">
                    {row.lastEventFormatted}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

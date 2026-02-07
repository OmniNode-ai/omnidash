/**
 * TopicSelector Component
 *
 * A compact navigation pane for selecting Kafka topics in the Event Bus
 * Monitor. Visually distinct from data tables: tighter rows, muted
 * background, strong selected state with left-border accent.
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

  const filteredTopics = useMemo(() => {
    if (filter === 'all') return topics;
    return topics.filter((t) => t.status === filter);
  }, [topics, filter]);

  const handleRowClick = (topic: string) => {
    onSelectTopic(selectedTopic === topic ? null : topic);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30">
      {/* Header — tight, control-like */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Topics
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {activeCount}/{topics.length} active
          </span>
        </div>

        {/* Filter toggles */}
        <div className="flex items-center gap-0.5 rounded-md bg-background/50 p-0.5">
          {(['all', 'active', 'silent'] as const).map((mode) => (
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
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Topic list — compact nav rows */}
      <ScrollArea className="max-h-[260px]">
        <div className="py-0.5">
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
                  onClick={() => handleRowClick(row.topic)}
                  className={cn(
                    'w-full flex items-center gap-2.5 py-1.5 px-3 cursor-pointer transition-all text-left',
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

                  {/* Label + canonical — primary/secondary hierarchy */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        'text-[13px] leading-tight',
                        isSelected ? 'font-semibold text-foreground' : 'font-medium'
                      )}
                    >
                      {row.label}
                    </span>
                    <div className="text-[10px] text-muted-foreground/70 font-mono truncate leading-tight">
                      {row.topic}
                    </div>
                  </div>

                  {/* Count + recency — right-aligned */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'text-[11px] tabular-nums font-medium min-w-[2ch] text-right',
                        row.eventCount > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                      )}
                    >
                      {row.eventCount > 0 ? row.eventCount.toLocaleString() : '\u2014'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 w-[52px] text-right whitespace-nowrap">
                      {row.lastEventFormatted}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

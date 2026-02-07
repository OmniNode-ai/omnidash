/**
 * TopicSelector Component
 *
 * A compact navigation control panel for selecting Kafka topics in the
 * Event Bus Monitor. Designed as a selector/control rather than a data
 * table -- visually distinct selected state, status dots, filter toggles.
 */

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const STATUS_DOT_COLORS: Record<TopicStatusRow['status'], string> = {
  active: 'bg-emerald-500',
  silent: 'bg-amber-500/60',
  error: 'bg-red-500',
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
    <Card className="bg-card/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Topics</span>
          <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
            {activeCount}/{topics.length}
          </Badge>
        </div>

        {/* Filter toggles */}
        <div className="flex items-center gap-0.5">
          {(['all', 'active', 'silent'] as const).map((mode) => (
            <Button
              key={mode}
              variant={filter === mode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setFilter(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Topic list */}
      <ScrollArea className="max-h-[320px]">
        <div className="px-1 pb-1">
          {filteredTopics.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              No {filter} topics
            </p>
          ) : (
            filteredTopics.map((row) => {
              const isSelected = selectedTopic === row.topic;

              return (
                <button
                  key={row.topic}
                  type="button"
                  onClick={() => handleRowClick(row.topic)}
                  className={cn(
                    'w-full flex items-center gap-3 py-2 px-3 rounded-md cursor-pointer transition-colors text-left',
                    'hover:bg-accent/50',
                    isSelected && 'bg-accent border-l-2 border-l-primary',
                    !isSelected && 'border-l-2 border-l-transparent'
                  )}
                >
                  {/* Status dot */}
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_COLORS[row.status])}
                  />

                  {/* Label and canonical name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{row.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {row.topic}
                    </div>
                  </div>

                  {/* Count and last event */}
                  <div className="flex flex-col items-end shrink-0 gap-0.5">
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0 tabular-nums">
                      {row.eventCount > 0 ? row.eventCount.toLocaleString() : '\u2014'}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {row.lastEventFormatted}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

import { Card } from '@/components/ui/card';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Agent {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'error' | 'offline';
  currentTask?: string;
  successRate: number;
  quality?: number; // Quality score (0-100) based on confidence
  responseTime: number;
}

interface AgentStatusGridProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
  cardBackgroundClass?: string; // allow overriding card background (e.g., bg-muted)
  compact?: boolean;
  // When provided, the grid will render inside a scroll container of this height and only
  // mount visible rows (simple virtualization). If not provided, renders all cards.
  virtualHeightPx?: number;
}

export function AgentStatusGrid({
  agents,
  onAgentClick,
  cardBackgroundClass,
  compact,
  virtualHeightPx,
}: AgentStatusGridProps) {
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'bg-status-healthy';
      case 'idle':
        return 'bg-status-idle';
      case 'error':
        return 'bg-status-error';
      case 'offline':
        return 'bg-status-offline';
    }
  };

  // Lightweight virtualization: measure columns and row height, render only visible rows
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columns, setColumns] = useState(3);
  const [rowHeight, setRowHeight] = useState<number>(0);
  const rowGap = 12; // Tailwind gap-3 = 0.75rem = 12px

  useEffect(() => {
    if (!gridRef.current) return;
    const computeColumns = () => {
      const style = window.getComputedStyle(gridRef.current!);
      const template = style.getPropertyValue('grid-template-columns');
      const count = template ? template.split(' ').length : 3;
      setColumns(Math.max(1, count));
    };
    computeColumns();
    const resizeObserver = new ResizeObserver(() => computeColumns());
    resizeObserver.observe(gridRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!gridRef.current) return;
    // Measure first card for row height
    const firstCard = gridRef.current.querySelector('[data-agent-card]') as HTMLElement | null;
    if (firstCard) {
      const h = firstCard.offsetHeight;
      if (h) setRowHeight(h + rowGap);
    }
  }, [agents, compact]);

  const totalRows = useMemo(() => {
    return columns > 0 ? Math.ceil(agents.length / columns) : 0;
  }, [agents.length, columns]);

  const { startIndex, endIndex, topSpacer, bottomSpacer } = useMemo(() => {
    if (!virtualHeightPx || !rowHeight || columns <= 0) {
      return { startIndex: 0, endIndex: agents.length - 1, topSpacer: 0, bottomSpacer: 0 };
    }
    const bufferRows = 3;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows);
    const endRow = Math.min(
      totalRows - 1,
      Math.floor((scrollTop + virtualHeightPx) / rowHeight) + bufferRows
    );
    const startIdx = startRow * columns;
    const endIdx = Math.min(agents.length - 1, (endRow + 1) * columns - 1);
    const top = startRow * rowHeight;
    const bottom = Math.max(0, (totalRows - endRow - 1) * rowHeight);
    return { startIndex: startIdx, endIndex: endIdx, topSpacer: top, bottomSpacer: bottom };
  }, [virtualHeightPx, rowHeight, columns, scrollTop, totalRows, agents.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  };

  const itemsToRender = useMemo(() => {
    if (startIndex === 0 && endIndex === agents.length - 1) return agents;
    return agents.slice(startIndex, endIndex + 1);
  }, [agents, startIndex, endIndex]);

  const GridContent = (
    <div ref={gridRef} className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-3">
      {itemsToRender.map((agent) => (
        <Card
          key={agent.id}
          className={cn(
            compact ? 'p-3' : 'p-4',
            'hover-elevate active-elevate-2 cursor-pointer transition-all duration-200 ease-in-out border border-border/80 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]',
            cardBackgroundClass,
            agent.status === 'error' && 'border-status-error/30'
          )}
          onClick={() => onAgentClick?.(agent)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAgentClick?.(agent);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`View details for agent ${agent.name}`}
          data-testid={`card-agent-${agent.id}`}
          data-agent-card
        >
          <div className={cn('flex items-start justify-between', compact ? 'mb-2' : 'mb-3')}>
            <div className={cn('rounded-md bg-primary/10', compact ? 'p-1.5' : 'p-2')}>
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className={cn('h-2 w-2 rounded-full', getStatusColor(agent.status))} />
          </div>

          <div
            className={cn('font-medium truncate', compact ? 'text-xs mb-0.5' : 'text-sm mb-1')}
            title={agent.name}
          >
            {agent.name}
          </div>

          {agent.currentTask && (
            <div
              className={cn(
                'text-muted-foreground truncate',
                compact ? 'text-[11px] mb-1.5' : 'text-xs mb-2'
              )}
              title={agent.currentTask}
            >
              {agent.currentTask}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-xs')}>
              <span className="text-muted-foreground text-[10px]">Success:</span>
              <span className="font-mono text-status-healthy">
                {Math.max(0, Math.min(100, agent.successRate))}%
              </span>
            </div>
            {agent.quality !== undefined && (
              <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-xs')}>
                <span className="text-muted-foreground text-[10px]">Quality:</span>
                <span className="font-mono text-chart-1">
                  {Math.max(0, Math.min(100, agent.quality))}%
                </span>
              </div>
            )}
            <div className={cn('flex items-center gap-2', compact ? 'text-[11px]' : 'text-xs')}>
              <span className="text-muted-foreground text-[10px]">Response:</span>
              <span className="font-mono text-muted-foreground">{agent.responseTime}ms</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  if (!virtualHeightPx) {
    return GridContent;
  }

  return (
    <div
      ref={containerRef}
      style={{ maxHeight: virtualHeightPx, height: virtualHeightPx, overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: topSpacer }} />
      {GridContent}
      <div style={{ height: bottomSpacer }} />
    </div>
  );
}

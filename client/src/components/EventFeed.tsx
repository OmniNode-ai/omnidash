import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
  source?: string;
}

interface EventFeedProps {
  events: Event[];
  maxHeight?: number;
  bare?: boolean; // when true, render just the list (no outer Card/header)
}

export function EventFeed({ events, maxHeight = 400, bare = false }: EventFeedProps) {
  const getIndicatorColor = (type: Event["type"]) => {
    switch (type) {
      case "success": return "bg-status-healthy";
      case "warning": return "bg-status-warning";
      case "error": return "bg-status-error";
      default: return "bg-primary";
    }
  };

  const List = (
    <ScrollArea className={`pr-4`} style={{ maxHeight: `${maxHeight}px` }}>
      <div className="space-y-3">
        {events.map((event, index) => (
          <div
            key={event.id}
            className={cn(
              "flex gap-3 p-3 rounded-lg border animate-slide-in bg-card border-border"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className={cn("w-1 rounded", getIndicatorColor(event.type))} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="ty-code">{event.timestamp}</span>
                {event.source && (
                  <Badge variant="outline" className="text-xs">
                    {event.source}
                  </Badge>
                )}
              </div>
              <div className="ty-body">{event.message}</div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  if (bare) return List;

  return (
    <Card className="p-6" data-testid="feed-events">
      <h3 className="text-base font-semibold mb-4">Live Event Stream</h3>
      {List}
    </Card>
  );
}

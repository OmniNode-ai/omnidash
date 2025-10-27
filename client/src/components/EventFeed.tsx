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
}

export function EventFeed({ events, maxHeight = 400 }: EventFeedProps) {
  const getEventColor = (type: Event["type"]) => {
    switch (type) {
      case "success": return "bg-status-healthy/10 text-status-healthy border-status-healthy/20";
      case "warning": return "bg-status-warning/10 text-status-warning border-status-warning/20";
      case "error": return "bg-status-error/10 text-status-error border-status-error/20";
      default: return "bg-primary/10 text-primary border-primary/20";
    }
  };

  return (
    <Card className="p-6" data-testid="feed-events">
      <h3 className="text-base font-semibold mb-4">Live Event Stream</h3>
      <ScrollArea className={`pr-4`} style={{ maxHeight: `${maxHeight}px` }}>
        <div className="space-y-3">
          {events.map((event, index) => (
            <div 
              key={event.id} 
              className={cn(
                "flex gap-3 p-3 rounded-lg border animate-slide-in",
                getEventColor(event.type)
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono">{event.timestamp}</span>
                  {event.source && (
                    <Badge variant="outline" className="text-xs">
                      {event.source}
                    </Badge>
                  )}
                </div>
                <div className="text-sm">{event.message}</div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

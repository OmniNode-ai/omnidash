import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Activity {
  id?: string;
  timestamp: string | number | Date;
  description: string;
}

interface UsageExample {
  id?: string;
  project: string;
  module: string;
}

interface DrillDownPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: Record<string, any> & {
    recentActivity?: Activity[];
    usageExamples?: UsageExample[];
  };
  type?: "agent" | "pattern" | "service" | "gate" | "generic";
}

export function DrillDownPanel({ open, onOpenChange, title, data, type = "generic" }: DrillDownPanelProps) {
  const renderContent = () => {
    switch (type) {
      case "agent":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <Badge variant={data.status === "active" ? "default" : "secondary"}>
                  {data.status}
                </Badge>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
                <div className="text-2xl font-bold font-mono">{Math.max(0, Math.min(100, data.successRate))}%</div>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Performance Metrics</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Response Time</span>
                  <span className="font-mono text-sm">{data.responseTime}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tasks Completed</span>
                  <span className="font-mono text-sm">{data.tasksCompleted || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Current Task</span>
                  <span className="text-sm">{data.currentTask || "Idle"}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-3">Recent Activity</h4>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {(data.recentActivity && data.recentActivity.length > 0) ? (
                    data.recentActivity.map((activity, i) => (
                      <div key={activity.id || i} className="text-xs p-2 rounded-md bg-secondary/50">
                        <div className="font-mono text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="mt-1">{activity.description}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground p-2">No recent activity</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        );

      case "pattern":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Quality Score</div>
                <div className="text-2xl font-bold font-mono">{Math.round(data.quality)}%</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Usage Count</div>
                <div className="text-2xl font-bold font-mono">{data.usage || data.usageCount}x</div>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Pattern Details</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <Badge variant="secondary">{data.category}</Badge>
                </div>
                {data.description && (
                  <div>
                    <span className="text-sm text-muted-foreground">Description</span>
                    <p className="text-sm mt-1">{data.description}</p>
                  </div>
                )}
                {data.trend !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Trend</span>
                    <span className={`font-mono text-sm ${data.trend > 0 ? 'text-status-healthy' : 'text-status-error'}`}>
                      {data.trend > 0 ? '+' : ''}{data.trend}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-3">Usage Examples</h4>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {(data.usageExamples && data.usageExamples.length > 0) ? (
                    data.usageExamples.map((example, i) => (
                      <div key={example.id || i} className="text-xs p-3 rounded-md bg-secondary/50">
                        <div className="font-mono mb-1">{example.project}</div>
                        <div className="text-muted-foreground">
                          Used in module: {example.module}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground p-2">No usage examples available</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        );

      case "service":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <Badge variant={data.status === "healthy" ? "default" : "destructive"}>
                  {data.status}
                </Badge>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Uptime</div>
                <div className="text-2xl font-bold font-mono">{data.uptime}%</div>
              </Card>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Service Metrics</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Response Time</span>
                  <span className="font-mono text-sm">{data.responseTime}ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Check</span>
                  <span className="text-sm">{new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className="text-sm font-mono">{String(value)}</span>
              </div>
            ))}
          </div>
        );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Detailed information and metrics</SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {renderContent()}
        </div>
      </SheetContent>
    </Sheet>
  );
}

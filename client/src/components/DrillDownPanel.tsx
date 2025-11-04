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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  useAgentDetails,
  usePatternDetails,
  useServiceDetails,
  type AgentDetails,
  type PatternDetails,
  type ServiceDetails,
} from "@/hooks/useDrillDownData";

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

// Support both legacy prop-based data and new ID-based fetching
interface DrillDownPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  type?: "agent" | "pattern" | "service" | "gate" | "generic";

  // Legacy: pass data directly
  data?: Record<string, any> & {
    recentActivity?: Activity[];
    usageExamples?: UsageExample[];
  };

  // New: pass ID to fetch data
  entityId?: string | null;
  timeWindow?: string;
}

export function DrillDownPanel({
  open,
  onOpenChange,
  title,
  data,
  type = "generic",
  entityId,
  timeWindow = "24h"
}: DrillDownPanelProps) {

  // Fetch data based on type and entityId
  const agentQuery = useAgentDetails(
    type === "agent" ? (entityId ?? null) : null,
    timeWindow,
    open && !!entityId && !data
  );

  const patternQuery = usePatternDetails(
    type === "pattern" ? (entityId ?? null) : null,
    open && !!entityId && !data
  );

  const serviceQuery = useServiceDetails(
    type === "service" ? (entityId ?? null) : null,
    open && !!entityId && !data
  );

  // Determine which data source to use
  const resolvedData = data ||
    (type === "agent" ? agentQuery.data : null) ||
    (type === "pattern" ? patternQuery.data : null) ||
    (type === "service" ? serviceQuery.data : null);

  const isLoading = !data && (
    (type === "agent" && agentQuery.isLoading) ||
    (type === "pattern" && patternQuery.isLoading) ||
    (type === "service" && serviceQuery.isLoading)
  );

  const error = !data && (
    (type === "agent" && agentQuery.error) ||
    (type === "pattern" && patternQuery.error) ||
    (type === "service" && serviceQuery.error)
  );

  const renderLoadingState = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-24" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-8 w-20" />
        </Card>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );

  const renderErrorState = (err: Error) => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Failed to load details: {err.message}
      </AlertDescription>
    </Alert>
  );

  const renderAgentContent = (agentData: AgentDetails | Record<string, any>) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Status</div>
          <Badge variant={agentData.status === "active" ? "default" : "secondary"}>
            {agentData.status}
          </Badge>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
          <div className="text-2xl font-bold font-mono">{Math.max(0, Math.min(100, agentData.successRate))}%</div>
        </Card>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">Performance Metrics</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Response Time</span>
            <span className="font-mono text-sm">{agentData.responseTime}ms</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Tasks Completed</span>
            <span className="font-mono text-sm">{agentData.tasksCompleted || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Current Task</span>
            <span className="text-sm">{agentData.currentTask || "Idle"}</span>
          </div>
          {agentData.metrics && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg Confidence</span>
                <span className="font-mono text-sm">{(agentData.metrics.avgConfidence * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg Routing Time</span>
                <span className="font-mono text-sm">{agentData.metrics.avgRoutingTime.toFixed(1)}ms</span>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="text-sm font-semibold mb-3">Recent Activity</h4>
        <ScrollArea className="h-48">
          <div className="space-y-2">
            {(agentData.recentActivity && agentData.recentActivity.length > 0) ? (
              agentData.recentActivity.map((activity: Activity, i: number) => (
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

  const renderPatternContent = (patternData: PatternDetails | Record<string, any>) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Quality Score</div>
          <div className="text-2xl font-bold font-mono">{Math.max(0, Math.min(100, Math.round(patternData.quality)))}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Usage Count</div>
          <div className="text-2xl font-bold font-mono">{patternData.usage || patternData.usageCount}x</div>
        </Card>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">Pattern Details</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Category</span>
            <Badge variant="secondary">{patternData.category}</Badge>
          </div>
          {patternData.description && (
            <div>
              <span className="text-sm text-muted-foreground">Description</span>
              <p className="text-sm mt-1">{patternData.description}</p>
            </div>
          )}
          {patternData.trend !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Trend</span>
              <span className={`font-mono text-sm ${patternData.trend > 0 ? 'text-status-healthy' : 'text-status-error'}`}>
                {patternData.trend > 0 ? '+' : ''}{patternData.trend}%
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
            {(patternData.usageExamples && patternData.usageExamples.length > 0) ? (
              patternData.usageExamples.map((example: UsageExample, i: number) => (
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

  const renderServiceContent = (serviceData: ServiceDetails | Record<string, any>) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Status</div>
          <Badge variant={serviceData.status === "healthy" ? "default" : "destructive"}>
            {serviceData.status}
          </Badge>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Uptime</div>
          <div className="text-2xl font-bold font-mono">{Math.max(0, Math.min(100, serviceData.uptime))}%</div>
        </Card>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">Service Metrics</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Response Time</span>
            <span className="font-mono text-sm">{serviceData.responseTime}ms</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Last Check</span>
            <span className="text-sm">
              {serviceData.lastCheck
                ? new Date(serviceData.lastCheck).toLocaleTimeString()
                : new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {serviceData.details && (
        <>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold mb-3">Additional Details</h4>
            <div className="space-y-2">
              {Object.entries(serviceData.details).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="text-sm font-mono">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderGenericContent = (genericData: Record<string, any>) => (
    <div className="space-y-4">
      {Object.entries(genericData).map(([key, value]) => (
        <div key={key} className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </span>
          <span className="text-sm font-mono">{String(value)}</span>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    // Show loading state
    if (isLoading) {
      return renderLoadingState();
    }

    // Show error state
    if (error) {
      return renderErrorState(error as Error);
    }

    // Show appropriate content based on type
    if (!resolvedData) {
      return (
        <Alert>
          <AlertDescription>
            No data available
          </AlertDescription>
        </Alert>
      );
    }

    switch (type) {
      case "agent":
        return renderAgentContent(resolvedData);
      case "pattern":
        return renderPatternContent(resolvedData);
      case "service":
        return renderServiceContent(resolvedData);
      default:
        return renderGenericContent(resolvedData);
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

import React from "react";
import { DetailModal } from "./DetailModal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Server, 
  Database,
  Code,
  Eye,
  Settings,
  Download,
  RefreshCw
} from "lucide-react";

interface DrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: Record<string, any>;
  type?: "agent" | "pattern" | "service" | "gate" | "generic";
  variant?: "modal" | "side-panel";
}

export function DrillDownModal({ 
  open, 
  onOpenChange, 
  title, 
  data, 
  type = "generic",
  variant = "modal" 
}: DrillDownModalProps) {
  const handleClose = () => onOpenChange(false);

  const renderContent = () => {
    switch (type) {
      case "agent":
        return (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
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

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Response Time</div>
                  <div className="text-lg font-semibold">{data.responseTime}ms</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Tasks Completed</div>
                  <div className="text-lg font-semibold">{data.tasksCompleted || 0}</div>
                </Card>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">Current Status</h4>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Current Task:</span>{" "}
                    <span className="font-medium">{data.currentTask || "Idle"}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4 mt-4">
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
                    <span className="text-sm text-muted-foreground">Success Rate</span>
                    <span className="font-mono text-sm">{Math.max(0, Math.min(100, data.successRate))}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Uptime</span>
                    <span className="font-mono text-sm">{data.uptime || "99.9"}%</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4 mt-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">Recent Activity</h4>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="text-xs p-3 rounded-md bg-secondary/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-muted-foreground">
                            {new Date(Date.now() - i * 60000).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="mt-1">Completed analysis task #{100 - i}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        );

      case "pattern":
        return (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Quality Score</div>
                  <div className="text-2xl font-bold font-mono">{Math.max(0, Math.min(100, (data.quality || 0) <= 1 ? (data.quality || 0) * 100 : (data.quality || 0))).toFixed(1)}%</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Usage Count</div>
                  <div className="text-2xl font-bold font-mono">{data.usage || data.usageCount}x</div>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Category</div>
                  <Badge variant="secondary">{data.category}</Badge>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Trend</div>
                  {data.trendPercentage !== undefined ? (
                    <div className={`text-lg font-semibold ${data.trendPercentage > 0 ? 'text-green-500' : data.trendPercentage < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {data.trendPercentage > 0 ? '+' : ''}{data.trendPercentage}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-muted-foreground">
                      N/A
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
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
                  {data.trendPercentage !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Trend</span>
                      <span className={`font-mono text-sm ${data.trendPercentage > 0 ? 'text-green-500' : data.trendPercentage < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {data.trendPercentage > 0 ? '+' : ''}{data.trendPercentage}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4 mt-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">Usage Examples</h4>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="text-xs p-3 rounded-md bg-secondary/50">
                        <div className="font-mono mb-1">Project {i + 1}</div>
                        <div className="text-muted-foreground">
                          Used in module: /src/components/Example{i + 1}.tsx
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        );

      case "service":
        return (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
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
                <h4 className="text-sm font-semibold mb-3">Service Information</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <span className="text-sm">{data.serviceType}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">URL</span>
                    <span className="text-sm font-mono text-xs">{data.serviceUrl}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Last Check</span>
                    <span className="text-sm">{new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4 mt-4">
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
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Uptime</span>
                    <span className="font-mono text-sm">{data.uptime}%</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        );

      default:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(data).slice(0, 4).map(([key, value]) => (
                <Card key={key} className="p-4">
                  <div className="text-xs text-muted-foreground mb-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-lg font-semibold font-mono">{String(value)}</div>
                </Card>
              ))}
            </div>
            
            {Object.entries(data).length > 4 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Additional Details</h4>
                <div className="space-y-2">
                  {Object.entries(data).slice(4).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="text-sm font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  // If variant is side-panel, use the old Sheet-based approach
  if (variant === "side-panel") {
    const { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } = require("@/components/ui/sheet");
    
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

  // Default to modal variant
  return (
    <DetailModal
      isOpen={open}
      onClose={handleClose}
      title={title}
      subtitle={`${type.charAt(0).toUpperCase() + type.slice(1)} Details`}
    >
      <div className="space-y-4">
        {renderContent()}
        
        {/* Action buttons */}
        <Separator />
        <div className="flex gap-2 pt-4">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    </DetailModal>
  );
}

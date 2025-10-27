import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Threshold {
  id: string;
  name: string;
  current: number;
  max: number;
  unit: string;
  critical?: number;
  warning?: number;
}

interface PerformanceThresholdsProps {
  thresholds: Threshold[];
}

export function PerformanceThresholds({ thresholds }: PerformanceThresholdsProps) {
  const getThresholdStatus = (threshold: Threshold) => {
    const percentage = (threshold.current / threshold.max) * 100;
    if (threshold.critical && percentage >= threshold.critical) return "critical";
    if (threshold.warning && percentage >= threshold.warning) return "warning";
    return "normal";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "critical": return "bg-status-error";
      case "warning": return "bg-status-warning";
      default: return "bg-status-healthy";
    }
  };

  return (
    <Card className="p-6" data-testid="panel-performance-thresholds">
      <h3 className="text-base font-semibold mb-6">Performance Thresholds</h3>
      
      <div className="space-y-6">
        {thresholds.map((threshold) => {
          const percentage = (threshold.current / threshold.max) * 100;
          const status = getThresholdStatus(threshold);
          
          return (
            <div key={threshold.id} data-testid={`threshold-${threshold.id}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{threshold.name}</span>
                <span className="text-sm font-mono">
                  {threshold.current} / {threshold.max} {threshold.unit}
                </span>
              </div>
              
              <div className="relative">
                <Progress 
                  value={percentage} 
                  className="h-2"
                />
                <div 
                  className={cn("absolute top-0 left-0 h-2 rounded-full transition-all", getStatusColor(status))}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>

              {status !== "normal" && (
                <div className={cn(
                  "text-xs mt-1",
                  status === "critical" && "text-status-error",
                  status === "warning" && "text-status-warning"
                )}>
                  {status === "critical" ? "Critical threshold exceeded" : "Warning threshold reached"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

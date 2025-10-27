import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: LucideIcon;
  className?: string;
  status?: "healthy" | "warning" | "error" | "offline";
}

export function MetricCard({ label, value, trend, icon: Icon, className, status }: MetricCardProps) {
  return (
    <Card className={cn("p-6", className)} data-testid={`card-metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {label}
          </div>
          <div className="text-4xl font-bold font-mono">
            {value}
          </div>
          {trend && (
            <div className={cn(
              "text-sm mt-2 font-medium",
              trend.isPositive ? "text-status-healthy" : "text-status-error"
            )}>
              {trend.isPositive ? "+" : ""}{trend.value}%
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "p-3 rounded-lg",
            status === "healthy" && "bg-status-healthy/10 text-status-healthy",
            status === "warning" && "bg-status-warning/10 text-status-warning",
            status === "error" && "bg-status-error/10 text-status-error",
            !status && "bg-primary/10 text-primary"
          )}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
      {status && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-card-border">
          <div className={cn(
            "h-2 w-2 rounded-full",
            status === "healthy" && "bg-status-healthy",
            status === "warning" && "bg-status-warning",
            status === "error" && "bg-status-error",
            status === "offline" && "bg-status-offline"
          )} />
          <span className="text-xs text-muted-foreground capitalize">{status}</span>
        </div>
      )}
    </Card>
  );
}

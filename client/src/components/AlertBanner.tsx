import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface Alert {
  level: "critical" | "warning";
  message: string;
  timestamp: string;
}

interface AlertsResponse {
  alerts: Alert[];
}

export function AlertBanner() {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("dismissedAlerts");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // Fetch alerts every 30 seconds
  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["/api/intelligence/alerts/active"],
    refetchInterval: 30000, // 30 seconds
    staleTime: 25000, // Consider stale after 25 seconds
  });

  // Save dismissed alerts to localStorage
  useEffect(() => {
    localStorage.setItem("dismissedAlerts", JSON.stringify(Array.from(dismissedAlerts)));
  }, [dismissedAlerts]);

  // Filter out dismissed alerts
  const activeAlerts = data?.alerts?.filter(
    (alert) => !dismissedAlerts.has(`${alert.level}:${alert.message}`)
  ) || [];

  // Separate by level
  const criticalAlerts = activeAlerts.filter((a) => a.level === "critical");
  const warningAlerts = activeAlerts.filter((a) => a.level === "warning");

  // Don't render if no active alerts
  if (isLoading || activeAlerts.length === 0) {
    return null;
  }

  const handleDismiss = (alert: Alert) => {
    const key = `${alert.level}:${alert.message}`;
    setDismissedAlerts((prev) => {
      const newSet = new Set(prev);
      newSet.add(key);
      return newSet;
    });
  };

  return (
    <div className="space-y-2 px-6 py-4 border-b border-border bg-background">
      {/* Critical Alerts */}
      {criticalAlerts.map((alert, index) => (
        <div
          key={`critical-${index}`}
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-3 rounded-lg",
            "bg-status-error/10 border border-status-error/20"
          )}
          data-testid="alert-critical"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 rounded-lg bg-status-error/20">
              <AlertCircle className="w-5 h-5 text-status-error" />
            </div>
            <div>
              <div className="text-sm font-semibold text-status-error">Critical Alert</div>
              <div className="text-sm text-foreground">{alert.message}</div>
            </div>
          </div>
          <button
            onClick={() => handleDismiss(alert)}
            className="p-1 rounded-lg hover:bg-status-error/20 transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="w-4 h-4 text-status-error" />
          </button>
        </div>
      ))}

      {/* Warning Alerts */}
      {warningAlerts.map((alert, index) => (
        <div
          key={`warning-${index}`}
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-3 rounded-lg",
            "bg-status-warning/10 border border-status-warning/20"
          )}
          data-testid="alert-warning"
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 rounded-lg bg-status-warning/20">
              <AlertTriangle className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <div className="text-sm font-semibold text-status-warning">Warning</div>
              <div className="text-sm text-foreground">{alert.message}</div>
            </div>
          </div>
          <button
            onClick={() => handleDismiss(alert)}
            className="p-1 rounded-lg hover:bg-status-warning/20 transition-colors"
            aria-label="Dismiss alert"
          >
            <X className="w-4 h-4 text-status-warning" />
          </button>
        </div>
      ))}
    </div>
  );
}

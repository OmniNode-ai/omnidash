import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertPill } from "@/components/AlertPill";
import { useDemoMode } from "@/contexts/DemoModeContext";

interface Alert {
  id: string;
  level: "critical" | "warning";
  message: string;
  timestamp: string;
}

interface AlertsResponse {
  alerts: Alert[];
}

export function AlertBanner() {
  const { isDemoMode } = useDemoMode();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("dismissedAlerts");
    try {
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // In demo mode, don't fetch real alerts
  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["/api/intelligence/alerts/active"],
    refetchInterval: isDemoMode ? false : 30000, // 30 seconds
    staleTime: 30000, // Consider stale after 30 seconds
    enabled: !isDemoMode, // Disable in demo mode
  });

  // Save dismissed alerts to localStorage
  useEffect(() => {
    localStorage.setItem("dismissedAlerts", JSON.stringify(Array.from(dismissedAlerts)));
  }, [dismissedAlerts]);

  // In demo mode, show no alerts (or seed benign ones if needed)
  if (isDemoMode) {
    return null;
  }

  // Filter out dismissed alerts using unique IDs
  const activeAlerts = data?.alerts?.filter(
    (alert) => !dismissedAlerts.has(alert.id)
  ) || [];

  // Don't render if no active alerts
  if (isLoading || activeAlerts.length === 0) {
    return null;
  }

  const handleDismiss = (alert: Alert) => {
    setDismissedAlerts((prev) => {
      const newSet = new Set(prev);
      newSet.add(alert.id);
      return newSet;
    });
  };

  return (
    <div className="flex items-center gap-2 px-6 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {activeAlerts.map((alert) => (
        <AlertPill
          key={alert.id}
          level={alert.level}
          message={alert.message}
          onDismiss={() => handleDismiss(alert)}
        />
      ))}
    </div>
  );
}

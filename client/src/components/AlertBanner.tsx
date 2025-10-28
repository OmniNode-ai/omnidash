import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertPill } from "@/components/AlertPill";

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
    <div className="flex items-center gap-2 px-6 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {activeAlerts.map((alert, index) => (
        <AlertPill
          key={`${alert.level}-${index}`}
          level={alert.level}
          message={alert.message}
          onDismiss={() => handleDismiss(alert)}
        />
      ))}
    </div>
  );
}

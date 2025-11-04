import { cn } from "@/lib/utils";

export function StatusLegend() {
  return (
    <div className="flex gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-status-healthy"></div>
        <span className="text-muted-foreground">Healthy (within threshold)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-status-warning"></div>
        <span className="text-muted-foreground">Warning (exceeds threshold)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-status-error"></div>
        <span className="text-muted-foreground">Critical (severely degraded)</span>
      </div>
    </div>
  );
}

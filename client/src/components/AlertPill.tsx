import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertPillProps {
  level: "critical" | "warning" | "info";
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function AlertPill({ level, message, onDismiss, className }: AlertPillProps) {
  const styles = {
    critical: {
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-900/50",
      text: "text-red-700 dark:text-red-400",
      icon: "text-red-600 dark:text-red-500",
      hover: "hover:bg-red-100 dark:hover:bg-red-950/50",
      Icon: AlertCircle,
    },
    warning: {
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      border: "border-yellow-200 dark:border-yellow-900/50",
      text: "text-yellow-700 dark:text-yellow-400",
      icon: "text-yellow-600 dark:text-yellow-500",
      hover: "hover:bg-yellow-100 dark:hover:bg-yellow-950/50",
      Icon: AlertTriangle,
    },
    info: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-900/50",
      text: "text-blue-700 dark:text-blue-400",
      icon: "text-blue-600 dark:text-blue-500",
      hover: "hover:bg-blue-100 dark:hover:bg-blue-950/50",
      Icon: Info,
    },
  };

  const style = styles[level];
  const Icon = style.Icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border shadow-sm",
        "transition-all duration-200 hover:shadow-md",
        style.bg,
        style.border,
        style.text,
        style.hover,
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0", style.icon)} aria-hidden="true" />
      <span className="truncate max-w-[400px]" title={message}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={cn(
            "ml-1 flex-shrink-0 rounded-full p-0.5 transition-colors",
            "hover:bg-black/10 dark:hover:bg-white/10",
            "focus:outline-none focus:ring-2 focus:ring-offset-1",
            style.icon
          )}
          aria-label="Dismiss alert"
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

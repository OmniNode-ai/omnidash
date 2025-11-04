import React, { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";

export type PresetRange = "24h" | "7d" | "30d" | "custom";

export interface DateRangeValue {
  preset: PresetRange;
  start?: string; // ISO date
  end?: string;   // ISO date
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

/**
 * Validates that end date is on or after start date
 * @returns error message if invalid, null if valid
 */
function validateDateRange(start?: string, end?: string): string | null {
  // Allow empty dates (optional fields)
  if (!start || !end) {
    return null;
  }

  // Parse dates for comparison
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Check for invalid dates
  if (isNaN(startDate.getTime())) {
    return "Start date is invalid";
  }
  if (isNaN(endDate.getTime())) {
    return "End date is invalid";
  }

  // Ensure end date is on or after start date
  if (endDate < startDate) {
    return "End date must be on or after start date";
  }

  return null;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate whenever dates change
  useEffect(() => {
    if (value.preset === "custom") {
      const error = validateDateRange(value.start, value.end);
      setValidationError(error);
    } else {
      setValidationError(null);
    }
  }, [value.preset, value.start, value.end]);

  const handleStartChange = (newStart: string) => {
    onChange({ ...value, start: newStart });
  };

  const handleEndChange = (newEnd: string) => {
    onChange({ ...value, end: newEnd });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select value={value.preset} onValueChange={(v) => onChange({ preset: v as PresetRange, start: undefined, end: undefined })}>
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
        {value.preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={value.start || ""}
              onChange={(e) => handleStartChange(e.target.value)}
              className={`h-8 w-[150px] ${validationError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              aria-invalid={!!validationError}
              aria-describedby={validationError ? "date-range-error" : undefined}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={value.end || ""}
              onChange={(e) => handleEndChange(e.target.value)}
              className={`h-8 w-[150px] ${validationError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
              aria-invalid={!!validationError}
              aria-describedby={validationError ? "date-range-error" : undefined}
            />
          </div>
        )}
      </div>
      {validationError && (
        <div
          id="date-range-error"
          className="flex items-center gap-1 text-xs text-red-500"
          role="alert"
          data-testid="date-range-error"
        >
          <AlertCircle className="h-3 w-3" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}



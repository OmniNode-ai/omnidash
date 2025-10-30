import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
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
          <Input type="date" value={value.start || ""} onChange={(e) => onChange({ ...value, start: e.target.value })} className="h-8 w-[150px]" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={value.end || ""} onChange={(e) => onChange({ ...value, end: e.target.value })} className="h-8 w-[150px]" />
        </div>
      )}
    </div>
  );
}



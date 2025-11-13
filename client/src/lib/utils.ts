import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getSuccessRateVariant = (rate: number): "default" | "secondary" | "destructive" | "outline" => {
  if (rate >= 98) return "default";      // Blue/Green - Excellent
  if (rate >= 95) return "secondary";    // Gray - Good
  if (rate >= 90) return "outline";      // Outline - Fair
  return "destructive";                  // Red - Poor
};

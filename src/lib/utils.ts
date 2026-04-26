// SOURCE: shadcn/ui standard utilities.
// Keeps class composition consistent across the app: last-wins merge that's
// Tailwind-aware (so `p-2 p-4` collapses correctly).
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

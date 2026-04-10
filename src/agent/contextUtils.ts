import type { DashboardLayoutItem } from '@shared/types/dashboard';
import type { GlobalFilters } from '@/store/types';

interface UserContextArgs {
  layout: DashboardLayoutItem[];
  timeRange?: { start: string; end: string };
  filters: GlobalFilters;
}

export function buildUserContext({ layout, timeRange, filters }: UserContextArgs): string {
  const components = [...new Set(layout.map((i) => i.componentName))];

  const filterParts: string[] = [];
  if (filters.repo) filterParts.push(`repo=${filters.repo}`);
  if (filters.author) filterParts.push(`author=${filters.author}`);
  const filterStr = filterParts.join(', ');

  if (layout.length === 0) {
    const rangeNote = timeRange ? ` Time range: ${timeRange.start.slice(0, 10)} to ${timeRange.end.slice(0, 10)}.` : '';
    return `Current dashboard: empty dashboard.${rangeNote}`;
  }

  // Keep concise — this is injected into each user message, not the system prompt
  const componentSummary =
    components.slice(0, 8).join(', ') +
    (components.length > 8 ? ` (+${components.length - 8} more)` : '');

  const parts = [
    `Current dashboard: ${layout.length} component(s) — ${componentSummary}.`,
  ];
  if (timeRange) {
    parts.push(`Time range: ${timeRange.start.slice(0, 10)} to ${timeRange.end.slice(0, 10)}.`);
  }
  if (filterStr) parts.push(`Active filters: ${filterStr}.`);

  return parts.join(' ');
}

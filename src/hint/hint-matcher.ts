import { EnumDashboardWidgetType } from '../shared/types/generated/enum-dashboard-widget-type';

const WIDGET_TO_CATEGORIES: Record<EnumDashboardWidgetType, string[]> = {
  [EnumDashboardWidgetType.Chart]: ['visualization', 'metrics'],
  [EnumDashboardWidgetType.Table]: ['table'],
  [EnumDashboardWidgetType.Tile]: ['metrics', 'status'],
  [EnumDashboardWidgetType.List]: ['stream', 'status'],
  [EnumDashboardWidgetType.Scalar]: ['metrics'],
};

export function pickComponentForHint(
  hint: { widget_type: EnumDashboardWidgetType },
  available: ReadonlyArray<{ manifest: { name: string; category: string } }>,
): string | null {
  const preferredCategories = WIDGET_TO_CATEGORIES[hint.widget_type] ?? [];
  for (const cat of preferredCategories) {
    const match = available.find((c) => c.manifest.category === cat);
    if (match) return match.manifest.name;
  }
  return null;
}

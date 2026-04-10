export interface DashboardLayoutItem {
  i: string;
  componentName: string;
  componentVersion: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface DashboardDefinition {
  id: string;
  schemaVersion: '1.0';
  name: string;
  description?: string;
  theme?: string;
  layout: DashboardLayoutItem[];
  globalFilters?: {
    timeRange?: { start: string; end: string };
  };
  createdAt: string;
  updatedAt: string;
  author: string;
  shared: boolean;
}

export interface DashboardValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDashboardDefinition(def: DashboardDefinition): DashboardValidationResult {
  const errors: string[] = [];

  if (!def.name || def.name.trim() === '') {
    errors.push('Dashboard name is required');
  }
  if (!def.id) {
    errors.push('Dashboard id is required');
  }
  if (def.schemaVersion !== '1.0') {
    errors.push(`Unsupported schemaVersion: ${def.schemaVersion}`);
  }

  for (const item of def.layout) {
    if (!item.componentName || item.componentName.trim() === '') {
      errors.push(`Layout item "${item.i}" has empty componentName`);
    }
    if (item.w <= 0 || item.h <= 0) {
      errors.push(`Layout item "${item.i}" has invalid size: ${item.w}x${item.h}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

let counter = 0;
export function createEmptyDashboard(name: string, author: string): DashboardDefinition {
  const now = new Date().toISOString();
  counter++;
  return {
    id: `dash-${Date.now()}-${counter}`,
    schemaVersion: '1.0',
    name,
    layout: [],
    createdAt: now,
    updatedAt: now,
    author,
    shared: false,
  };
}

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

export type ParsedDashboardResult =
  | { valid: true; dashboard: DashboardDefinition }
  | { valid: false; errors: string[] };

function validateTopLevelFields(v: Record<string, unknown>): string | null {
  if (typeof v.id !== 'string' || v.id.trim() === '') return 'Dashboard id is required and must be a string';
  if (typeof v.name !== 'string') return 'Dashboard name is required and must be a string';
  if (v.schemaVersion !== '1.0') return `Unsupported schemaVersion: ${String(v.schemaVersion)}`;
  if (!Array.isArray(v.layout)) return 'Dashboard layout must be an array';
  if (typeof v.createdAt !== 'string' || typeof v.updatedAt !== 'string') return 'Dashboard createdAt/updatedAt must be ISO date strings';
  if (typeof v.author !== 'string') return 'Dashboard author is required';
  if (typeof v.shared !== 'boolean') return 'Dashboard shared flag must be boolean';
  return null;
}

function validateLayoutItem(idx: number, raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [`Layout item ${idx} must be an object`];
  }
  const item = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof item.i !== 'string') errors.push(`Layout item ${idx} missing string field "i"`);
  if (typeof item.componentName !== 'string' || item.componentName.trim() === '') errors.push(`Layout item ${idx} has empty componentName`);
  if (typeof item.componentVersion !== 'string') errors.push(`Layout item ${idx} missing componentVersion`);
  if (typeof item.x !== 'number' || typeof item.y !== 'number') errors.push(`Layout item ${idx} has non-numeric x/y`);
  if (typeof item.w !== 'number' || typeof item.h !== 'number' || item.w <= 0 || item.h <= 0) errors.push(`Layout item ${idx} has invalid size`);
  if (!item.config || typeof item.config !== 'object' || Array.isArray(item.config)) errors.push(`Layout item ${idx} config must be an object`);
  return errors;
}

/**
 * Tolerant variant of validateDashboardDefinition for I/O boundaries
 * (localStorage hydration, HTTP responses) where the input is `unknown`.
 * Returns a typed dashboard on success, or a list of structural errors on
 * failure — never throws and never returns a typed-but-corrupt value.
 */
export function parseDashboardDefinition(value: unknown): ParsedDashboardResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Expected an object'] };
  }
  const v = value as Record<string, unknown>;

  const topLevelError = validateTopLevelFields(v);
  if (topLevelError) return { valid: false, errors: [topLevelError] };

  const errors: string[] = (v.layout as unknown[]).flatMap((raw, idx) => validateLayoutItem(idx, raw));
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, dashboard: value as DashboardDefinition };
}

export function createEmptyDashboard(name: string, author: string): DashboardDefinition {
  const now = new Date().toISOString();
  return {
    id: `dash-${crypto.randomUUID()}`,
    schemaVersion: '1.0',
    name,
    layout: [],
    createdAt: now,
    updatedAt: now,
    author,
    shared: false,
  };
}

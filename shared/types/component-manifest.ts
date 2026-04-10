export const COMPONENT_CATEGORIES = ['visualization', 'metrics', 'table', 'status', 'stream'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export interface GridSize {
  w: number;
  h: number;
}

export interface DataSourceDeclaration {
  type: 'websocket' | 'api';
  topic?: string;
  endpoint?: string;
  required: boolean;
  purpose: 'live_updates' | 'initial_fetch';
  auth_required?: boolean;
}

export interface ComponentEvent {
  name: string;
  schema?: Record<string, unknown>;
}

export interface ComponentManifest {
  name: string;
  displayName: string;
  description: string;
  category: ComponentCategory;
  version: string;
  implementationKey: string;
  configSchema: Record<string, unknown>;
  dataSources: DataSourceDeclaration[];
  events: {
    emits: ComponentEvent[];
    consumes: ComponentEvent[];
  };
  defaultSize: GridSize;
  minSize: GridSize;
  maxSize: GridSize;
  emptyState: {
    message: string;
    hint?: string;
  };
  capabilities: {
    supports_compare: boolean;
    supports_export: boolean;
    supports_fullscreen: boolean;
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateComponentManifest(m: ComponentManifest): ManifestValidationResult {
  const errors: string[] = [];

  if (!m.name || m.name.trim() === '') errors.push('name is required');
  if (!m.displayName) errors.push('displayName is required');
  if (!m.implementationKey) errors.push('implementationKey is required');
  if (!COMPONENT_CATEGORIES.includes(m.category)) {
    errors.push(`Invalid category "${m.category}". Must be one of: ${COMPONENT_CATEGORIES.join(', ')}`);
  }
  if (m.minSize.w > m.maxSize.w || m.minSize.h > m.maxSize.h) {
    errors.push('minSize cannot exceed maxSize');
  }
  if (m.defaultSize.w < m.minSize.w || m.defaultSize.h < m.minSize.h) {
    errors.push('defaultSize cannot be smaller than minSize');
  }
  if (m.defaultSize.w > m.maxSize.w || m.defaultSize.h > m.maxSize.h) {
    errors.push('defaultSize cannot exceed maxSize');
  }

  return { valid: errors.length === 0, errors };
}

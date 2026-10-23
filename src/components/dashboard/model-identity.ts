import type { CSSProperties } from 'react';
import { modelColor } from '@/lib/dashboard-colors';

// Stable presentation derived from the exact served identity. No backend/model
// inventory is embedded here, and arrival order cannot recolor existing rows.
export function modelIdentityStyle(value: unknown): CSSProperties {
  const color = modelColor(typeof value === 'string' ? value : '');
  return { '--model-identity-color': color, '--field-ink': color } as CSSProperties;
}

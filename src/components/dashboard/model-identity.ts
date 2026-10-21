import type { CSSProperties } from 'react';

// Stable presentation derived from the exact served identity. No backend/model
// inventory is embedded here, and arrival order cannot recolor existing rows.
export function modelIdentityStyle(value: unknown): CSSProperties {
  const name = typeof value === 'string' ? value : '';
  if (!name || /^(none|unknown|not recorded)$/i.test(name)) {
    return { '--model-identity-color': 'var(--field-unavailable)' } as CSSProperties;
  }
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const hue = (hash >>> 0) / 4294967296 * 360;
  return { '--model-identity-hue': hue.toFixed(3) } as CSSProperties;
}

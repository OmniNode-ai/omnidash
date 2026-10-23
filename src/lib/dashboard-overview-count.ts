import { wholeCount } from './dashboard-count';

/**
 * The overview exposure's model groups cover every run in the same snapshot (migration 094, model_rows).
 * Derive only its omitted call total; a capped list of individual decisions cannot supply this fallback.
 * A subsequently served total takes precedence. Never mutate the authoritative snapshot.
 */
export function overviewRunCount(value: unknown): string | number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.run_count !== undefined && row.run_count !== null && row.run_count !== '') {
    return wholeCount(row.run_count) === null ? null : row.run_count as string | number;
  }
  if (row.window !== 'all' || !Array.isArray(row.rows) || row.rows.length === 0) return null;
  const identities = new Set<string>();
  let total = 0n;
  for (const group of row.rows) {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) return null;
    const model = group as Record<string, unknown>;
    if (typeof model.model_id !== 'string' || !model.model_id.trim()
      || typeof model.display_name !== 'string' || !model.display_name.trim()) return null;
    const identity = JSON.stringify([model.model_id, model.display_name]);
    if (identities.has(identity)) return null;
    identities.add(identity);
    const count = wholeCount(model.task_count);
    if (count === null) return null;
    total += count;
  }
  return total.toString();
}

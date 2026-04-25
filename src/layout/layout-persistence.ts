/**
 * layout-persistence.ts
 *
 * Browser-side helpers for reading and writing dashboard layouts via the
 * Vite dev-server /_layouts middleware.
 *
 * GET  /_layouts/<name>  → 200 with JSON body, or 404 if not found.
 * POST /_layouts/<name>  → 200 with the written JSON body (upsert / idempotent).
 */

import type { DashboardDefinition } from '@shared/types/dashboard';
import { parseDashboardDefinition } from '@shared/types/dashboard';

export interface LayoutPersistence {
  read(name: string): Promise<DashboardDefinition | null>;
  write(name: string, layout: DashboardDefinition): Promise<void>;
}

/**
 * Default implementation that talks to the /_layouts Vite middleware.
 * The `baseUrl` defaults to '' (same-origin) and is injectable for tests.
 */
export class HttpLayoutPersistence implements LayoutPersistence {
  constructor(private readonly baseUrl: string = '') {}

  async read(name: string): Promise<DashboardDefinition | null> {
    const url = `${this.baseUrl}/_layouts/${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/_layouts read failed: ${res.status} ${res.statusText}`);
    const body: unknown = await res.json();
    const result = parseDashboardDefinition(body);
    if (!result.valid) {
      throw new Error(
        `/_layouts read returned malformed dashboard for "${name}": ${result.errors.join('; ')}`,
      );
    }
    return result.dashboard;
  }

  async write(name: string, layout: DashboardDefinition): Promise<void> {
    const url = `${this.baseUrl}/_layouts/${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    });
    if (!res.ok) throw new Error(`/_layouts write failed: ${res.status} ${res.statusText}`);
  }
}

/** Singleton used by the application. */
export const layoutPersistence: LayoutPersistence = new HttpLayoutPersistence();

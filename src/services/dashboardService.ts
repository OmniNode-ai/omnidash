import type { DashboardDefinition } from '@shared/types/dashboard';
import { validateDashboardDefinition, parseDashboardDefinition } from '@shared/types/dashboard';
import type { LayoutPersistence } from '@/layout/layout-persistence';
import { layoutPersistence } from '@/layout/layout-persistence';

// localStorage keys for the multi-dashboard list. Owned exclusively by this
// service (T14 / OMN-155) — no other module is permitted to read or write
// these keys.
const LS_LIST_KEY = 'omnidash.dashboards.list.v1';
const LS_ACTIVE_KEY = 'omnidash.lastActiveId.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export class DashboardService {
  private store = new Map<string, DashboardDefinition>();
  private readonly persistence: LayoutPersistence;
  private readonly storage: StorageLike | null;

  constructor(
    persistence: LayoutPersistence = layoutPersistence,
    storage: StorageLike | null = defaultStorage(),
  ) {
    this.persistence = persistence;
    this.storage = storage;
  }

  async save(dashboard: DashboardDefinition): Promise<void> {
    const validation = validateDashboardDefinition(dashboard);
    if (!validation.valid) {
      throw new Error(`Invalid dashboard: ${validation.errors.join(', ')}`);
    }
    const updated = { ...dashboard, updatedAt: new Date().toISOString() };
    this.store.set(dashboard.id, updated);
    // Async side effect — fire and forget; does not block the hot-path save.
    this.persistence.write(dashboard.name, updated).catch((err: unknown) => {
      console.warn('[DashboardService] layout persistence write failed:', err);
    });
  }

  async loadByName(name: string): Promise<DashboardDefinition | null> {
    return this.persistence.read(name).catch((err: unknown) => {
      console.warn('[DashboardService] layout persistence read failed:', err);
      return null;
    });
  }

  // ── Multi-dashboard list persistence ────────────────────────────────
  // These methods own localStorage[LS_LIST_KEY] and LS_ACTIVE_KEY. They
  // are the canonical replacement for the persistList/persistActiveId
  // helpers that used to live in dashboardSlice.

  persistList(dashboards: DashboardDefinition[]): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(LS_LIST_KEY, JSON.stringify(dashboards));
    } catch {
      // storage unavailable — non-fatal
    }
  }

  persistActiveId(id: string | null): void {
    if (!this.storage) return;
    try {
      if (id === null) {
        this.storage.removeItem(LS_ACTIVE_KEY);
      } else {
        this.storage.setItem(LS_ACTIVE_KEY, id);
      }
    } catch {
      // storage unavailable — non-fatal
    }
  }

  hydrateList(): DashboardDefinition[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(LS_LIST_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const valid: DashboardDefinition[] = [];
      for (const [idx, entry] of parsed.entries()) {
        const result = parseDashboardDefinition(entry);
        if (result.valid) {
          valid.push(result.dashboard);
        } else {
          console.warn(
            `[DashboardService] Dropping corrupted dashboard at index ${idx}: ${result.errors.join('; ')}`,
          );
        }
      }
      return valid;
    } catch {
      return [];
    }
  }

  hydrateActiveId(): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(LS_ACTIVE_KEY);
    } catch {
      return null;
    }
  }

  async getById(id: string): Promise<DashboardDefinition | undefined> {
    return this.store.get(id);
  }

  async listAll(): Promise<DashboardDefinition[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async clone(id: string, newName: string): Promise<DashboardDefinition | undefined> {
    const original = this.store.get(id);
    if (!original) return undefined;

    const now = new Date().toISOString();
    const cloned: DashboardDefinition = {
      ...structuredClone(original),
      id: `dash-${crypto.randomUUID()}-clone`,
      name: newName,
      createdAt: now,
      updatedAt: now,
      shared: false,
    };
    this.store.set(cloned.id, cloned);
    return cloned;
  }

  async exportJson(id: string): Promise<string | undefined> {
    const dash = this.store.get(id);
    if (!dash) return undefined;
    return JSON.stringify(dash, null, 2);
  }

  async importJson(json: string): Promise<DashboardDefinition> {
    // Validate the parsed JSON shape at the I/O boundary before doing
    // anything else with it. The previous code cast straight from
    // JSON.parse() to DashboardDefinition and only validated *after*
    // spreading the (possibly malformed) value into a new object —
    // which meant fields like `layout` could be `undefined` and crash
    // the spread, or could be the wrong type and pass spread but
    // corrupt the in-memory store.
    const raw: unknown = JSON.parse(json);
    const parseResult = parseDashboardDefinition(raw);
    if (!parseResult.valid) {
      throw new Error(`Invalid dashboard JSON: ${parseResult.errors.join(', ')}`);
    }
    const now = new Date().toISOString();
    const imported: DashboardDefinition = {
      ...parseResult.dashboard,
      id: `dash-${crypto.randomUUID()}-import`,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(imported.id, imported);
    return imported;
  }
}

/**
 * Application-wide singleton. The dashboardSlice and DashboardView import
 * this rather than constructing their own service so all writes land in
 * the same persistence path (T14 / OMN-155).
 */
export const dashboardService = new DashboardService();

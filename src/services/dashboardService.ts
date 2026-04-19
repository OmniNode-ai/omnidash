import type { DashboardDefinition } from '@shared/types/dashboard';
import { validateDashboardDefinition } from '@shared/types/dashboard';
import type { LayoutPersistence } from '@/layout/layout-persistence';
import { layoutPersistence } from '@/layout/layout-persistence';

export class DashboardService {
  private store = new Map<string, DashboardDefinition>();
  private readonly persistence: LayoutPersistence;

  constructor(persistence: LayoutPersistence = layoutPersistence) {
    this.persistence = persistence;
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
    // PROVISIONAL ID: dash-${Date.now()}-clone is a temporary collision-prone ID.
    // Real persistence will use UUIDs from the Drizzle schema (uuid().primaryKey().defaultRandom()).
    const cloned: DashboardDefinition = {
      ...structuredClone(original),
      id: `dash-${Date.now()}-clone`,
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
    const parsed = JSON.parse(json) as DashboardDefinition;
    const now = new Date().toISOString();
    // PROVISIONAL ID: dash-${Date.now()}-import is a temporary collision-prone ID.
    // Real persistence will use UUIDs from the Drizzle schema.
    const imported: DashboardDefinition = {
      ...parsed,
      id: `dash-${Date.now()}-import`,
      createdAt: now,
      updatedAt: now,
    };
    const validation = validateDashboardDefinition(imported);
    if (!validation.valid) {
      throw new Error(`Invalid dashboard JSON: ${validation.errors.join(', ')}`);
    }
    this.store.set(imported.id, imported);
    return imported;
  }
}

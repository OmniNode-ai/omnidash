import type { DashboardDefinition } from '@shared/types/dashboard';
import { validateDashboardDefinition } from '@shared/types/dashboard';

export class DashboardService {
  private store = new Map<string, DashboardDefinition>();

  async save(dashboard: DashboardDefinition): Promise<void> {
    const validation = validateDashboardDefinition(dashboard);
    if (!validation.valid) {
      throw new Error(`Invalid dashboard: ${validation.errors.join(', ')}`);
    }
    this.store.set(dashboard.id, { ...dashboard, updatedAt: new Date().toISOString() });
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

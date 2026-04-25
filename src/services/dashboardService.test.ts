// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardService } from './dashboardService';
import type { LayoutPersistence } from '@/layout/layout-persistence';
import type { DashboardDefinition } from '@shared/types/dashboard';
import { createEmptyDashboard } from '@shared/types/dashboard';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    // Stub persistence so fire-and-forget writes inside save() don't leak
    // unhandled rejections through the test harness when there is no fetch
    // implementation behind /_layouts.
    const persistence: LayoutPersistence = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
    };
    service = new DashboardService(persistence);
  });

  it('creates and retrieves a dashboard', async () => {
    const dash = createEmptyDashboard('Test Dashboard', 'jonah');
    await service.save(dash);
    const loaded = await service.getById(dash.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Test Dashboard');
  });

  it('lists all dashboards', async () => {
    await service.save(createEmptyDashboard('A', 'jonah'));
    await service.save(createEmptyDashboard('B', 'jonah'));
    const list = await service.listAll();
    expect(list.length).toBe(2);
  });

  it('updates an existing dashboard', async () => {
    const dash = createEmptyDashboard('Original', 'jonah');
    await service.save(dash);
    await service.save({ ...dash, name: 'Updated' });
    const loaded = await service.getById(dash.id);
    expect(loaded!.name).toBe('Updated');
  });

  it('deletes a dashboard', async () => {
    const dash = createEmptyDashboard('Delete Me', 'jonah');
    await service.save(dash);
    await service.delete(dash.id);
    const loaded = await service.getById(dash.id);
    expect(loaded).toBeUndefined();
  });

  it('clones a dashboard with new ID and name', async () => {
    const dash = createEmptyDashboard('Original', 'jonah');
    dash.layout.push({ i: 'a', componentName: 'test', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 4, config: {} });
    await service.save(dash);
    const clone = await service.clone(dash.id, 'Clone of Original');
    expect(clone).toBeDefined();
    expect(clone!.id).not.toBe(dash.id);
    expect(clone!.name).toBe('Clone of Original');
    expect(clone!.layout.length).toBe(1);
  });

  it('exports and imports a dashboard JSON', async () => {
    const dash = createEmptyDashboard('Export Test', 'jonah');
    await service.save(dash);
    const json = await service.exportJson(dash.id);
    expect(json).toBeDefined();

    const imported = await service.importJson(json!);
    expect(imported.name).toBe('Export Test');
    expect(imported.id).not.toBe(dash.id); // New ID on import
  });
});

// T14 acceptance: round-trip a dashboard through save → reload via the
// LayoutPersistence port and observe identical state.
describe('DashboardService.save → loadByName round-trip (T14 / OMN-155)', () => {
  function makePersistence() {
    const store = new Map<string, DashboardDefinition>();
    const persistence: LayoutPersistence = {
      read: vi.fn(async (name: string) => store.get(name) ?? null),
      write: vi.fn(async (name: string, layout: DashboardDefinition) => {
        store.set(name, layout);
      }),
    };
    return { persistence, store };
  }

  it('save() then loadByName() returns an equivalent dashboard', async () => {
    const { persistence } = makePersistence();
    const service = new DashboardService(persistence);
    const dash = createEmptyDashboard('Round Trip', 'bret');
    dash.layout.push({
      i: 'a',
      componentName: 'cost-trend-panel',
      componentVersion: '1.0.0',
      x: 0,
      y: 0,
      w: 6,
      h: 4,
      config: { granularity: 'day' },
    });
    await service.save(dash);
    // Allow the fire-and-forget persistence.write to settle.
    await new Promise((r) => setTimeout(r, 0));
    const loaded = await service.loadByName(dash.name);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(dash.id);
    expect(loaded!.layout).toHaveLength(1);
    expect(loaded!.layout[0].config).toEqual({ granularity: 'day' });
  });
});

// T14 acceptance: list/active-id persistence is owned by the service
// (not by the slice). Direct localStorage interaction is the contract.
describe('DashboardService list persistence (T14 / OMN-155)', () => {
  function makeMemoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      _map: map,
    };
  }

  it('persistList round-trips through hydrateList', () => {
    const storage = makeMemoryStorage();
    const persistence: LayoutPersistence = {
      read: vi.fn(),
      write: vi.fn(),
    };
    const service = new DashboardService(persistence, storage);
    const dashes = [createEmptyDashboard('A', 'bret'), createEmptyDashboard('B', 'bret')];
    service.persistList(dashes);
    const loaded = service.hydrateList();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((d) => d.name)).toEqual(['A', 'B']);
  });

  it('hydrateList drops corrupted entries with a warning', () => {
    const storage = makeMemoryStorage();
    const valid = createEmptyDashboard('Good', 'bret');
    const corrupted = { id: 'bad', name: 'no schemaVersion' };
    storage.setItem('omnidash.dashboards.list.v1', JSON.stringify([valid, corrupted]));
    const persistence: LayoutPersistence = { read: vi.fn(), write: vi.fn() };
    const service = new DashboardService(persistence, storage);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = service.hydrateList();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(valid.id);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('persistActiveId(null) removes the key', () => {
    const storage = makeMemoryStorage();
    const persistence: LayoutPersistence = { read: vi.fn(), write: vi.fn() };
    const service = new DashboardService(persistence, storage);
    service.persistActiveId('dash-1');
    expect(service.hydrateActiveId()).toBe('dash-1');
    service.persistActiveId(null);
    expect(service.hydrateActiveId()).toBeNull();
  });
});

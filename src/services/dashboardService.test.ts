import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardService } from './dashboardService';
import { createEmptyDashboard } from '@shared/types/dashboard';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService();
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

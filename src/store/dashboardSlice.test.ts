import { describe, it, expect, beforeEach } from 'vitest';
import { useFrameStore } from './store';

// Reset helper — merges (no `true` flag) to preserve action functions from slices.
const resetFrameStore = () =>
  useFrameStore.setState({
    editMode: false,
    activeDashboard: null,
    activeDashboardId: null,
    dashboards: [],
    globalFilters: {},
  });

describe('Dashboard slice', () => {
  beforeEach(() => {
    resetFrameStore();
  });

  it('starts with no active dashboard', () => {
    expect(useFrameStore.getState().activeDashboard).toBeNull();
  });

  it('setActiveDashboard sets active dashboard (legacy compat)', () => {
    const dash = {
      id: 'test-1', schemaVersion: '1.0' as const, name: 'Test',
      layout: [], createdAt: '', updatedAt: '', author: 'test', shared: false,
    };
    useFrameStore.getState().setActiveDashboard(dash);
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Test');
    expect(useFrameStore.getState().activeDashboardId).toBe('test-1');
  });

  it('createDashboard adds to list and sets active', () => {
    useFrameStore.getState().createDashboard('My Board');
    const state = useFrameStore.getState();
    expect(state.dashboards.length).toBe(1);
    expect(state.dashboards[0].name).toBe('My Board');
    expect(state.activeDashboard?.name).toBe('My Board');
    expect(state.activeDashboardId).toBe(state.dashboards[0].id);
  });

  it('renameDashboard updates the name', () => {
    useFrameStore.getState().createDashboard('Old Name');
    const id = useFrameStore.getState().dashboards[0].id;
    useFrameStore.getState().renameDashboard(id, 'New Name');
    expect(useFrameStore.getState().dashboards[0].name).toBe('New Name');
    // activeDashboard derived value should also reflect new name
    expect(useFrameStore.getState().activeDashboard?.name).toBe('New Name');
  });

  it('deleteDashboard removes from list', () => {
    useFrameStore.getState().createDashboard('Board A');
    useFrameStore.getState().createDashboard('Board B');
    const idA = useFrameStore.getState().dashboards[0].id;
    useFrameStore.getState().deleteDashboard(idA);
    expect(useFrameStore.getState().dashboards.length).toBe(1);
    expect(useFrameStore.getState().dashboards[0].name).toBe('Board B');
  });

  it('deleteDashboard switches active if deleted board was active', () => {
    useFrameStore.getState().createDashboard('Board A');
    useFrameStore.getState().createDashboard('Board B');
    const idA = useFrameStore.getState().dashboards[0].id;
    useFrameStore.getState().setActiveDashboardById(idA);
    useFrameStore.getState().deleteDashboard(idA);
    // Should fall back to first remaining dashboard
    const state = useFrameStore.getState();
    expect(state.activeDashboard?.name).toBe('Board B');
  });

  it('setActiveDashboardById switches the active dashboard', () => {
    useFrameStore.getState().createDashboard('Board A');
    useFrameStore.getState().createDashboard('Board B');
    const [a, b] = useFrameStore.getState().dashboards;
    useFrameStore.getState().setActiveDashboardById(a.id);
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Board A');
    useFrameStore.getState().setActiveDashboardById(b.id);
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Board B');
  });

  it('adds component to layout', () => {
    const dash = {
      id: 'test-1', schemaVersion: '1.0' as const, name: 'Test',
      layout: [], createdAt: '', updatedAt: '', author: 'test', shared: false,
    };
    useFrameStore.getState().setActiveDashboard(dash);
    useFrameStore.getState().addComponentToLayout('cost-trend-panel', '1.0.0', { w: 6, h: 4 });
    const layout = useFrameStore.getState().activeDashboard!.layout;
    expect(layout.length).toBe(1);
    expect(layout[0].componentName).toBe('cost-trend-panel');
  });

  it('removes component from layout', () => {
    const dash = {
      id: 'test-1', schemaVersion: '1.0' as const, name: 'Test',
      layout: [{ i: 'item-1', componentName: 'test', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 4, config: {} }],
      createdAt: '', updatedAt: '', author: 'test', shared: false,
    };
    useFrameStore.getState().setActiveDashboard(dash);
    useFrameStore.getState().removeComponentFromLayout('item-1');
    expect(useFrameStore.getState().activeDashboard!.layout.length).toBe(0);
  });

  it('updates layout positions', () => {
    const dash = {
      id: 'test-1', schemaVersion: '1.0' as const, name: 'Test',
      layout: [{ i: 'item-1', componentName: 'test', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 4, config: {} }],
      createdAt: '', updatedAt: '', author: 'test', shared: false,
    };
    useFrameStore.getState().setActiveDashboard(dash);
    const updated = [{ ...dash.layout[0], x: 3, y: 2 }];
    useFrameStore.getState().updateLayout(updated);
    expect(useFrameStore.getState().activeDashboard!.layout[0].x).toBe(3);
  });
});

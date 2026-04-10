import { describe, it, expect, beforeEach } from 'vitest';
import { useFrameStore } from './store';

// Reset helper — merges (no `true` flag) to preserve action functions from slices.
// Using replace (true) wipes all action functions since they live in the store state.
const resetFrameStore = () =>
  useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });

describe('Dashboard slice', () => {
  beforeEach(() => {
    resetFrameStore();
  });

  it('starts with no active dashboard', () => {
    expect(useFrameStore.getState().activeDashboard).toBeNull();
  });

  it('sets active dashboard', () => {
    const dash = {
      id: 'test-1', schemaVersion: '1.0' as const, name: 'Test',
      layout: [], createdAt: '', updatedAt: '', author: 'test', shared: false,
    };
    useFrameStore.getState().setActiveDashboard(dash);
    expect(useFrameStore.getState().activeDashboard?.name).toBe('Test');
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

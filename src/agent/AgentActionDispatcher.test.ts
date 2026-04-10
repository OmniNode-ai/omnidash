import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentActionDispatcher } from './AgentActionDispatcher';

describe('AgentActionDispatcher', () => {
  let dispatcher: AgentActionDispatcher;

  beforeEach(() => {
    dispatcher = new AgentActionDispatcher();
  });

  it('dispatches add_component and returns success result', async () => {
    const mockAddComponent = vi.fn().mockResolvedValue(undefined);
    dispatcher.setHandlers({
      addComponentToLayout: mockAddComponent,
      getRegistry: () => ({
        getAvailableComponents: () => [],
        getComponentsByCategory: () => [],
        getComponent: (name: string) => name === 'cost-trend-panel' ? { manifest: { name } } : undefined,
      }),
    });

    const result = await dispatcher.dispatch('add_component', {
      componentName: 'cost-trend-panel',
      position: { x: 0, y: 0, w: 6, h: 4 },
    });

    expect(result.success).toBe(true);
    expect(mockAddComponent).toHaveBeenCalledOnce();
  });

  it('returns error result for unknown action', async () => {
    const result = await dispatcher.dispatch('unknown_action', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('returns error result when validation fails', async () => {
    const result = await dispatcher.dispatch('add_component', {}); // missing componentName
    expect(result.success).toBe(false);
    expect(result.error).toContain('componentName is required');
  });

  it('returns error result when handler throws', async () => {
    const mockAddComponent = vi.fn().mockRejectedValue(new Error('Store rejected layout'));
    dispatcher.setHandlers({
      addComponentToLayout: mockAddComponent,
      getRegistry: () => ({
        getAvailableComponents: () => [],
        getComponentsByCategory: () => [],
        getComponent: (name: string) => name === 'cost-trend-panel' ? { manifest: { name } } : undefined,
      }),
    });

    const result = await dispatcher.dispatch('add_component', {
      componentName: 'cost-trend-panel',
      position: { x: 0, y: 0, w: 6, h: 4 },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Store rejected layout');
  });

  it('returns error when component not in registry', async () => {
    dispatcher.setHandlers({
      getRegistry: () => ({
        getAvailableComponents: () => [],
        getComponentsByCategory: () => [],
        getComponent: () => undefined,
      }),
    });

    const result = await dispatcher.dispatch('add_component', {
      componentName: 'nonexistent-component',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in registry');
  });

  it('dispatches list_themes and returns theme list', async () => {
    dispatcher.setHandlers({ getThemes: () => ['light', 'dark'] });
    const result = await dispatcher.dispatch('list_themes', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(['light', 'dark']);
  });

  it('dispatches load_template successfully', async () => {
    const setActiveDashboard = vi.fn();
    dispatcher.setHandlers({
      setActiveDashboard,
      getTemplates: () => [{ name: 'Platform Health' }],
    });

    const result = await dispatcher.dispatch('load_template', { templateName: 'Platform Health' });
    expect(result.success).toBe(true);
    expect(setActiveDashboard).toHaveBeenCalledWith({ name: 'Platform Health' });
  });

  it('returns error for missing template', async () => {
    dispatcher.setHandlers({ getTemplates: () => [] });
    const result = await dispatcher.dispatch('load_template', { templateName: 'Nonexistent' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

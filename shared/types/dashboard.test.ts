import { describe, it, expect } from 'vitest';
import { validateDashboardDefinition, createEmptyDashboard } from './dashboard';

describe('DashboardDefinition', () => {
  it('validates a minimal valid dashboard', () => {
    const dash = createEmptyDashboard('My Dashboard', 'jonah');
    const result = validateDashboardDefinition(dash);
    expect(result.valid).toBe(true);
  });

  it('rejects dashboard without name', () => {
    const dash = createEmptyDashboard('', 'jonah');
    const result = validateDashboardDefinition(dash);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('name');
  });

  it('rejects layout item with missing componentName', () => {
    const dash = createEmptyDashboard('Test', 'jonah');
    dash.layout.push({
      i: 'item-1',
      componentName: '',
      componentVersion: '1.0.0',
      x: 0, y: 0, w: 4, h: 3,
      config: {},
    });
    const result = validateDashboardDefinition(dash);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('componentName');
  });

  it('generates unique IDs', () => {
    const d1 = createEmptyDashboard('A', 'jonah');
    const d2 = createEmptyDashboard('B', 'jonah');
    expect(d1.id).not.toBe(d2.id);
  });
});

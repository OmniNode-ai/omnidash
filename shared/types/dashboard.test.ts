import { describe, it, expect } from 'vitest';
import { validateDashboardDefinition, createEmptyDashboard, parseDashboardDefinition } from './dashboard';

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

describe('parseDashboardDefinition (T2: I/O boundary validation)', () => {
  it('returns the typed dashboard on a well-formed payload', () => {
    const valid = createEmptyDashboard('OK', 'bret');
    const result = parseDashboardDefinition(valid);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.dashboard.id).toBe(valid.id);
  });

  it('rejects a non-object payload', () => {
    expect(parseDashboardDefinition(null).valid).toBe(false);
    expect(parseDashboardDefinition('a string').valid).toBe(false);
    expect(parseDashboardDefinition([]).valid).toBe(false);
  });

  it('rejects a payload missing required fields', () => {
    const result = parseDashboardDefinition({ id: 'd1', name: 'partial' });
    expect(result.valid).toBe(false);
  });

  it('rejects a layout entry with non-numeric size', () => {
    const result = parseDashboardDefinition({
      id: 'd1',
      schemaVersion: '1.0',
      name: 'X',
      layout: [
        {
          i: 'a',
          componentName: 'Foo',
          componentVersion: '1.0',
          x: 0,
          y: 0,
          w: 'wide',
          h: 3,
          config: {},
        },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      author: 'bret',
      shared: false,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('size'))).toBe(true);
  });

  it('rejects an unsupported schemaVersion', () => {
    const result = parseDashboardDefinition({
      id: 'd1',
      schemaVersion: '2.0',
      name: 'X',
      layout: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      author: 'bret',
      shared: false,
    });
    expect(result.valid).toBe(false);
  });
});

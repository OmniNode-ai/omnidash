import { describe, it, expect } from 'vitest';
import { dashboards } from './dashboards';

describe('dashboards schema', () => {
  it('has expected column names', () => {
    const columns = Object.keys(dashboards);
    expect(columns).toContain('id');
    expect(columns).toContain('name');
    expect(columns).toContain('definition');
    expect(columns).toContain('author');
    expect(columns).toContain('shared');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
  });
});

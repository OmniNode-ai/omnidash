import { describe, it, expect } from 'vitest';
import { AGENT_ACTIONS, validateAgentAction } from './actions';

describe('Agent action vocabulary', () => {
  it('defines 12 named actions', () => {
    expect(AGENT_ACTIONS.length).toBe(12);
  });

  it('all actions have name, description, and parameters schema', () => {
    for (const action of AGENT_ACTIONS) {
      expect(action.name).toBeTruthy();
      expect(action.description).toBeTruthy();
      expect(action.parameters).toBeDefined();
    }
  });

  it('validates a valid add_component action', () => {
    const result = validateAgentAction('add_component', {
      componentName: 'cost-trend-panel',
      position: { x: 0, y: 0, w: 6, h: 4 },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects add_component with missing componentName', () => {
    const result = validateAgentAction('add_component', { position: { x: 0, y: 0, w: 6, h: 4 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('componentName is required');
  });

  it('rejects unknown action name', () => {
    const result = validateAgentAction('destroy_everything', {});
    expect(result.valid).toBe(false);
  });

  it('validates set_time_range with enum value', () => {
    const result = validateAgentAction('set_time_range', { range: '7d' });
    expect(result.valid).toBe(true);
  });

  it('rejects set_time_range with invalid enum value', () => {
    const result = validateAgentAction('set_time_range', { range: 'invalid' });
    expect(result.valid).toBe(false);
  });

  it('requires from and to when range=custom', () => {
    const result = validateAgentAction('set_time_range', { range: 'custom' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('from is required when range=custom');
    expect(result.errors).toContain('to is required when range=custom');
  });

  it('accepts set_time_range custom with from and to', () => {
    const result = validateAgentAction('set_time_range', {
      range: 'custom',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-31T23:59:59Z',
    });
    expect(result.valid).toBe(true);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './eventBus';

describe('eventBus', () => {
  it('emits and receives typed events', () => {
    const handler = vi.fn();
    eventBus.on('component:node_selected', handler);
    eventBus.emit('component:node_selected', { nodeId: 'abc', source: 'test-component' });
    expect(handler).toHaveBeenCalledWith({ nodeId: 'abc', source: 'test-component' });
    eventBus.off('component:node_selected', handler);
  });

  it('unsubscribes correctly', () => {
    const handler = vi.fn();
    eventBus.on('component:node_selected', handler);
    eventBus.off('component:node_selected', handler);
    eventBus.emit('component:node_selected', { nodeId: 'abc', source: 'test' });
    expect(handler).not.toHaveBeenCalled();
  });
});

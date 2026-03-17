/**
 * Bridge wiring integration test -- verifies that all projection bridge
 * listeners defined in server/index.ts are properly wired to
 * eventConsumer.on() calls.
 *
 * This is a structural guard against the OMN-5132 class of bug where a
 * bridge listener is defined in projectionBridgeListeners but never
 * connected to the event consumer via .on().
 *
 * OMN-5160
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const INDEX_PATH = path.resolve(__dirname, '../index.ts');
const indexSource = fs.readFileSync(INDEX_PATH, 'utf-8');

// Extract listener names from projectionBridgeListeners definition
function extractBridgeListenerNames(source: string): string[] {
  const bridgeBlock = source.match(/projectionBridgeListeners\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!bridgeBlock) return [];

  // Match only top-level property names in the bridge object.
  // These are indented exactly 4 spaces (not deeper nested properties like
  // type/source/payload inside the arrow function bodies).
  const names: string[] = [];
  const propRegex = /^    (\w+)\s*:/gm;
  let match;
  while ((match = propRegex.exec(bridgeBlock[1])) !== null) {
    names.push(match[1]);
  }
  return names;
}

// Extract event names wired via eventConsumer.on()
function extractWiredEventNames(source: string): string[] {
  const names: string[] = [];
  const onRegex = /eventConsumer\.on\('(\w+)'/g;
  let match;
  while ((match = onRegex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('Bridge wiring integration', () => {
  const definedListeners = extractBridgeListenerNames(indexSource);
  const wiredEvents = extractWiredEventNames(indexSource);

  it('projectionBridgeListeners has expected listener count (5)', () => {
    expect(definedListeners.length).toBe(5);
  });

  it('all defined bridge listeners have matching eventConsumer.on() wiring', () => {
    const unwired = definedListeners.filter((name) => !wiredEvents.includes(name));
    expect(unwired).toEqual([]);
  });

  it('contains nodeIntrospectionUpdate listener and wiring', () => {
    expect(definedListeners).toContain('nodeIntrospectionUpdate');
    expect(wiredEvents).toContain('nodeIntrospectionUpdate');
  });

  it('contains nodeHeartbeatUpdate listener and wiring', () => {
    expect(definedListeners).toContain('nodeHeartbeatUpdate');
    expect(wiredEvents).toContain('nodeHeartbeatUpdate');
  });

  it('contains nodeStateChangeUpdate listener and wiring', () => {
    expect(definedListeners).toContain('nodeStateChangeUpdate');
    expect(wiredEvents).toContain('nodeStateChangeUpdate');
  });

  it('contains nodeBecameActive listener and wiring', () => {
    expect(definedListeners).toContain('nodeBecameActive');
    expect(wiredEvents).toContain('nodeBecameActive');
  });

  it('contains nodeRegistryUpdate listener and wiring', () => {
    expect(definedListeners).toContain('nodeRegistryUpdate');
    expect(wiredEvents).toContain('nodeRegistryUpdate');
  });
});

describe('Canonical handler emit coverage', () => {
  // OMN-5191: handlers moved from event-consumer.ts to domain/platform-handler.ts
  const PLATFORM_HANDLER_PATH = path.resolve(__dirname, '../consumers/domain/platform-handler.ts');
  const platformHandlerSource = fs.readFileSync(PLATFORM_HANDLER_PATH, 'utf-8');

  const EXPECTED_EMITS: [string, string][] = [
    ['handleCanonicalNodeIntrospection', 'nodeIntrospectionUpdate'],
    ['handleCanonicalNodeHeartbeat', 'nodeHeartbeatUpdate'],
    ['handleCanonicalNodeBecameActive', 'nodeBecameActive'],
  ];

  for (const [handler, expectedEvent] of EXPECTED_EMITS) {
    it(`${handler} emits '${expectedEvent}'`, () => {
      // Extract handler body using regex — now a free function, not a private method
      const handlerRegex = new RegExp(`function ${handler}[\\s\\S]*?\\n\\}`, 'm');
      const handlerBody = platformHandlerSource.match(handlerRegex);
      expect(handlerBody).not.toBeNull();
      // Handlers now use ctx.emit() instead of this.emit()
      const body = handlerBody![0].replace(/\s+/g, ' ');
      expect(body).toMatch(new RegExp(`ctx\\.emit\\(\\s*'${expectedEvent}'`));
    });
  }
});

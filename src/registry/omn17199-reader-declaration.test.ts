// OMN-17199 — the reader declaration must be resolved by the render layer, not only
// by CI.
//
// The omnibase_infra `exposure-reader-coverage` gate refuses a `bus_backed: true`
// projection exposure that no omnidash component declares in `dataSources[].topic`.
// That only means anything if the field is load-bearing HERE too. A field only a
// validator reads is a second source of truth, and this repo already carries the
// scar: three widgets still declare `onex.snapshot.projection.llm_cost.v1`, a topic
// no omnimarket contract has exposed since OMN-14896, and nothing noticed.
//
// These tests pin the two halves that keep the declaration honest:
//   1. Every topic the shipped manifest declares resolves to a runtime topic symbol.
//   2. The registry the app boots on resolves that declaration by component name.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComponentRegistry } from './ComponentRegistry';
import type { RegistryManifest } from './types';
import { TOPICS } from '@shared/types/topics';
import { RENDERER_CAPABILITY_PROJECTION } from '@shared/types/renderer-capability';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(resolve(here, './component-registry.json'), 'utf-8')
) as RegistryManifest;

const runtimeTopics = new Set<string>([
  ...Object.values(TOPICS),
  RENDERER_CAPABILITY_PROJECTION.topic,
]);

function declaredTopics(): { component: string; topic: string }[] {
  const out: { component: string; topic: string }[] = [];
  for (const [name, m] of Object.entries(manifest.components)) {
    for (const ds of m.dataSources ?? []) {
      if ((ds.type === 'projection' || ds.type === 'websocket') && ds.topic) {
        out.push({ component: name, topic: ds.topic });
      }
    }
  }
  return out;
}

describe('OMN-17199 reader declarations resolve at runtime', () => {
  it('the shipped manifest declares at least one projection reader', () => {
    // Guards the premise of every assertion below: an empty scan is not compliance.
    expect(declaredTopics().length).toBeGreaterThan(0);
  });

  it('every declared projection topic resolves to a runtime topic symbol', () => {
    const orphans = declaredTopics().filter(({ topic }) => !runtimeTopics.has(topic));
    expect(
      orphans,
      'a manifest dataSource topic with no runtime symbol is a declaration the render ' +
        'layer cannot serve — the exact rot shape OMN-14896 left behind. Add the topic ' +
        'to shared/types/topics.ts, or remove the dataSource.'
    ).toEqual([]);
  });

  it('the registry resolves a component\'s declared topics by name', () => {
    const registry = new ComponentRegistry(manifest);
    const [{ component, topic }] = declaredTopics();
    expect(registry.getProjectionTopics(component)).toContain(topic);
  });

  it('the registry resolves the readers of a topic, which is what the gate asserts', () => {
    const registry = new ComponentRegistry(manifest);
    const [{ component, topic }] = declaredTopics();
    expect(registry.getComponentsForProjectionTopic(topic).map((c) => c.name)).toContain(
      component
    );
  });

  // OMN-17775 / epic OMN-16776 group G3. Named rather than left to the generic
  // scan above: `onex.snapshot.projection.session.replay.v1` is declared
  // `bus_backed: true` by omnimarket's node_projection_session_replay contract
  // (OMN-17774), so a regeneration that silently dropped this component would
  // not fail here — it would fail in omnibase_infra's required
  // `exposure-reader-coverage` context, in a repo that did not cause it.
  it('session-replay is the declared reader of the bus-backed session-replay exposure', () => {
    const registry = new ComponentRegistry(manifest);
    expect(registry.getComponentsForProjectionTopic(TOPICS.sessionReplay).map((c) => c.name)).toContain(
      'session-replay'
    );
  });

  it('a topic no component declares has no readers', () => {
    const registry = new ComponentRegistry(manifest);
    expect(
      registry.getComponentsForProjectionTopic('onex.snapshot.projection.nobody-reads-this.v1')
    ).toEqual([]);
  });

  it('a component declaring an unserveable topic is marked error, not available', async () => {
    const rotted: RegistryManifest = {
      ...manifest,
      components: {
        'rotted-widget': {
          ...Object.values(manifest.components)[0],
          name: 'rotted-widget',
          dataSources: [
            {
              type: 'projection',
              topic: 'onex.snapshot.projection.no-such-symbol.v1',
              required: true,
              purpose: 'initial_fetch',
            },
          ],
        },
      },
    };
    const registry = new ComponentRegistry(rotted);
    await registry.resolveImplementations();
    const entry = registry.getComponent('rotted-widget');
    expect(entry?.status).toBe('error');
    expect(entry?.error).toContain('onex.snapshot.projection.no-such-symbol.v1');
  });

  it('every component in the shipped manifest still resolves cleanly', async () => {
    // The check above must not be retroactively breaking live widgets.
    const registry = new ComponentRegistry(manifest);
    await registry.resolveImplementations();
    const errored = registry
      .getAvailableComponents()
      .filter((c) => c.status === 'error')
      .map((c) => `${c.name}: ${c.error}`);
    expect(errored).toEqual([]);
  });
});

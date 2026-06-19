import { describe, it, expect } from 'vitest';
import { RENDERER_CAPABILITY_PROJECTION } from './renderer-capability';

// OMN-13131 (W6 live wiring): the renderer-capability projection READ topic must
// be the W5 reducer's DECLARED publish/exposure topic, or the dashboard polls a
// topic no reducer writes and the projection API returns 404 (the topic-drift
// bug this test pins shut).
//
// Source of truth (verbatim):
//   omnimarket/src/omnimarket/nodes/node_renderer_capability_projection/contract.yaml
//     event_bus.publish_topics:
//       - onex.evt.omnimarket.renderer-capability-projection-snapshot.v1
//     projection_api.exposures[0].topic:
//       - onex.evt.omnimarket.renderer-capability-projection-snapshot.v1
const W5_REDUCER_PUBLISHED_TOPIC =
  'onex.evt.omnimarket.renderer-capability-projection-snapshot.v1';

// The pre-fix value that read a topic no reducer ever wrote (always 404). Pinned
// here as a negative assertion so a regression to the drifted topic fails loudly.
const DRIFTED_404_TOPIC = 'onex.snapshot.projection.ui.renderer-capability.v1';

describe('RENDERER_CAPABILITY_PROJECTION', () => {
  it('reads the W5 reducer published/exposed projection topic verbatim', () => {
    expect(RENDERER_CAPABILITY_PROJECTION.topic).toBe(W5_REDUCER_PUBLISHED_TOPIC);
  });

  it('does NOT read the drifted topic that returns 404 (no reducer writes it)', () => {
    expect(RENDERER_CAPABILITY_PROJECTION.topic).not.toBe(DRIFTED_404_TOPIC);
  });

  it('targets the omnimarket event projection namespace, not a ui snapshot literal', () => {
    expect(RENDERER_CAPABILITY_PROJECTION.topic).toMatch(
      /^onex\.evt\.omnimarket\..+\.v\d+$/,
    );
  });

  it('exposes a stable display name for the projection descriptor', () => {
    expect(RENDERER_CAPABILITY_PROJECTION.displayName).toBe('Renderer Capabilities');
  });
});

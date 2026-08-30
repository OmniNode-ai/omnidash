// OMN-17197 (GOAL row 0) — the surface test.
//
// The epic OMN-16776 Phase 1 projection `onex.snapshot.projection.consumer-flow.v1`
// is live and serving (dev lane, 500 rows, `data_freshness: fresh`), and until this
// change NOTHING rendered it. That is the OMN-14440 precedent — a signal that fires
// forever into a surface no human opens.
//
// The decision recorded on OMN-17197 names ONE surface: `https://dev.dash.omninode.ai`
// (omnidash), default layout `seaDemoTemplate`. These assertions are what make that
// decision mechanical rather than a sentence in a ticket: a future edit that drops the
// widget out of the ARRIVAL layout, or leaves it visible only in the palette, goes red.
import { describe, it, expect } from 'vitest';
import { seaDemoTemplate, repairSeaDemoDashboard } from './sea-demo';
import { TEST_MANIFEST } from '@/test-utils/integrationHelpers';
import { TOPICS } from '@shared/types/topics';
import type { DashboardDefinition } from '@shared/types/dashboard';

const COMPONENT = 'consumer-flow';
const TOPIC = 'onex.snapshot.projection.consumer-flow.v1';

describe('OMN-17197 — consumer-flow is on the chosen surface, in the arrival layout', () => {
  it('exposes the topic as a named symbol rather than a literal', () => {
    expect(TOPICS.consumerFlow).toBe(TOPIC);
  });

  it('registers the component against the bus-backed consumer-flow exposure', () => {
    const manifest = TEST_MANIFEST.components[COMPONENT];
    expect(manifest, `registry has no "${COMPONENT}" component`).toBeDefined();
    const topics = manifest.dataSources.map((s) => s.topic);
    expect(topics).toContain(TOPIC);
  });

  it('is palette-visible, so the arrival layout is not stripped of it at load', () => {
    // DashboardView removes layout items whose component is classified `hidden`
    // (OMN-12833 A2.5). A hidden classification would silently delete this widget
    // from every dashboard on hydrate — the failure this assertion exists to catch.
    const manifest = TEST_MANIFEST.components[COMPONENT];
    expect(manifest.paletteVisibility).toBe('visible');
  });

  it('is in the DEFAULT layout a signed-in user arrives at, not only the palette', () => {
    const names = seaDemoTemplate.layout.map((item) => item.componentName);
    expect(names).toContain(COMPONENT);
  });

  it('arrives configured to show every state, not with three of four collapsed', () => {
    // AC4 is met by rendered pixels or not at all, and the widget's own default
    // hides IDLE. On the arrival layout that would leave a board on which IDLE
    // and STALLED cannot be compared at all — the four-state model lost exactly
    // at the render boundary the epic cares about.
    const entry = seaDemoTemplate.layout.find((item) => item.componentName === COMPONENT);
    expect(entry, 'consumer-flow is not in the arrival layout').toBeDefined();
    expect(entry!.config).toMatchObject({ hideIdle: false });
  });

  it('is back-filled into dashboards saved before this change', () => {
    // repairSeaDemoDashboard is why an existing operator with a saved layout sees the
    // widget too. Without this, the surface reaches new sessions only.
    const stale: DashboardDefinition = {
      ...seaDemoTemplate,
      layout: seaDemoTemplate.layout.filter((i) => i.componentName !== COMPONENT),
    };
    const repaired = repairSeaDemoDashboard(stale);
    expect(repaired.layout.map((i) => i.componentName)).toContain(COMPONENT);
  });
});

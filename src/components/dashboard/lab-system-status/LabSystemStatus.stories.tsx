import type { Meta, StoryObj } from '@storybook/react-vite';
import { LabSystemStatusView } from './LabSystemStatus';
import { summarise, type ExposureCensusRow } from '@/data-source/exposure-census';

/**
 * OMN-18771 — stories drive the pure view, so every state here is the real
 * rendering path rather than a mocked fetch.
 *
 * The Populated fixture is shaped from a live read of the .201 dev lane on
 * 2026-09-22: 65 exposures, all reporting `status: "ok"`, of which 17 are
 * `backing: "bus"` and 48 are `not_yet_bus_backed`. The proportions matter —
 * a story showing only healthy rows would hide the thing this widget exists
 * to show.
 */

const meta: Meta<typeof LabSystemStatusView> = {
  title: 'Dashboard/LabSystemStatus',
  component: LabSystemStatusView,
};

export default meta;
type Story = StoryObj<typeof LabSystemStatusView>;

function reachable(topic: string): ExposureCensusRow {
  return { topic, declaredStatus: 'ok', backing: 'bus', reachability: 'reachable', refusal: null };
}

function refused(topic: string): ExposureCensusRow {
  return {
    topic,
    declaredStatus: 'ok',
    backing: 'not_yet_bus_backed',
    reachability: 'refused',
    refusal: 'not_yet_bus_backed',
  };
}

export const Populated: Story = {
  args: {
    state: {
      kind: 'ready',
      census: summarise([
        reachable('onex.snapshot.projection.runner-fleet.v1'),
        reachable('onex.snapshot.projection.consumer-flow.v1'),
        reachable('onex.snapshot.projection.lab.lane-health.v1'),
        // The majority case on the live lane, and the reason the widget exists:
        // declared, reporting ok, and not serving from the bus.
        refused('onex.snapshot.projection.ab-compare.v1'),
        refused('onex.snapshot.projection.cost.savings-overview.v1'),
        refused('onex.snapshot.projection.work.events.v1'),
        {
          topic: 'onex.snapshot.projection.mystery.v1',
          declaredStatus: 'ok',
          backing: null,
          reachability: 'unknown',
          refusal: 'the catalogue entry declared neither backing nor bus_backed',
        },
      ]),
    },
  },
};

export const Empty: Story = {
  args: { state: { kind: 'ready', census: summarise([]) } },
};

export const Loading: Story = {
  args: { state: { kind: 'loading' } },
};

/** An unread catalogue is not an empty one, and reads differently on purpose. */
export const CatalogueUnreadable: Story = {
  args: {
    state: { kind: 'error', reason: 'GET /projections returned HTTP 503' },
  },
};

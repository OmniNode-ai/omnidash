/**
 * OMN-18771 — C4: the System Status widget's reachability census.
 *
 * WHAT THIS REFUSES TO DO.
 *
 * `GET /projections` reports `status: "ok"` on every exposure it declares. On
 * the .201 dev lane, 2026-09-22, that is 65 of 65 — while only 17 are actually
 * `backing: "bus"` and the remaining 48 are `not_yet_bus_backed`. A census that
 * rendered `status` would therefore draw 65 healthy rows over a surface where
 * 48 do not serve from the bus at all.
 *
 * That is the archived dashboard's failure reproduced: its topology view drew a
 * checked-in graph as observed wiring, so a topic whose consumer had died still
 * showed a healthy edge. This widget classifies on `backing`, and renders a
 * refusal under its own name rather than as an empty success.
 *
 * The topic set is read from the catalogue, never from an array in this file.
 * The count has already moved under the ticket — 61 exposures when it was
 * written on 2026-09-18, 65 today — which is exactly what a hardcoded list
 * would have silently got wrong.
 */

import { useEffect, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import {
  fetchExposureCensus,
  type ExposureCensus,
  type ExposureCensusRow,
} from '@/data-source/exposure-census';

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string }
  | { kind: 'ready'; census: ExposureCensus };

function ReachabilityLabel({ row }: { row: ExposureCensusRow }) {
  if (row.reachability === 'reachable') {
    return (
      <Text size="xs" family="mono" color="ok">
        reachable
      </Text>
    );
  }
  if (row.reachability === 'refused') {
    return (
      <Text size="xs" family="mono" color="warn">
        declared · refused
      </Text>
    );
  }
  return (
    <Text size="xs" family="mono" color="tertiary">
      unknown
    </Text>
  );
}

/**
 * The presentation half, deliberately pure.
 *
 * Kept separate from the fetch so a story or a test can drive every state —
 * including the refusal state AC4 asks about — without stubbing the network.
 * A widget whose only path to its own error state is a mocked module tends to
 * have that state go untested, which is how an empty success ships.
 */
export function LabSystemStatusView({ state }: { state: LoadState }) {
  const census = state.kind === 'ready' ? state.census : null;
  const rows = census?.rows ?? [];

  return (
    <ComponentWrapper
      title="System Status"
      isLoading={state.kind === 'loading'}
      error={state.kind === 'error' ? new Error(state.reason) : null}
      isEmpty={state.kind === 'ready' && rows.length === 0}
      emptyMessage="The catalogue was read and declares no exposures."
      emptyHint="This is a read that succeeded and returned nothing — distinct from a catalogue that could not be read, which surfaces as an error above."
      headerExtra={
        census !== null ? (
          <Text size="xs" family="mono" color="tertiary">
            {`${rows.length} declared · ${census.reachable} reachable · ${census.refused} refused · ${census.unknown} unknown`}
          </Text>
        ) : null
      }
    >
      <div>
        {rows.map((row) => (
          <div key={row.topic} data-testid="exposure-census-row">
            <Text size="xs" family="mono" color="secondary">
              {row.topic}
            </Text>
            <ReachabilityLabel row={row} />
            {row.refusal !== null ? (
              <Text size="xs" family="mono" color="tertiary">
                {row.refusal}
              </Text>
            ) : null}
          </div>
        ))}
      </div>
    </ComponentWrapper>
  );
}

export function LabSystemStatus() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchExposureCensus()
      .then((census) => {
        if (!cancelled) setState({ kind: 'ready', census });
      })
      .catch((err: unknown) => {
        // The reason is surfaced, not swallowed. "Could not read the catalogue"
        // and "the catalogue is empty" are different facts, and only one of
        // them means nothing is declared.
        if (!cancelled) {
          setState({
            kind: 'error',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <LabSystemStatusView state={state} />;
}

export default LabSystemStatus;

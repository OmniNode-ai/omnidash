/**
 * OMN-22168 AC4: the status chip and the badges of the local pages, which replace their hand-written spans. The markup is
 * the pages' own, so nothing a page shows moves.
 *
 * StatusChip is a run's outcome (passed, failed, ...): its colour keys on data-outcome, which is set only when the outcome
 * was served, so a run with no recorded outcome is never coloured as one.
 * Badge is a short label beside a value: a fixture run, the step that failed, the provider tried first, a run's
 * name: value chip and the since-last-visit counts. A page names the look and the kit owns the class.
 */
import type { ReactNode } from 'react';

export function StatusChip({ outcome, children }: {
  /** The served outcome; left out when none was served. */
  outcome?: string;
  children: ReactNode;
}) {
  return <span className="local-run-pill" data-outcome={outcome}>{children}</span>;
}

const LOOKS = {
  default: 'local-dashboard-badge',
  provider: 'local-provider-badge',
  'run-fact': 'local-run-chip',
  'since-visit': 'local-since-visit-chip',
} as const;
export type BadgeLook = keyof typeof LOOKS;

export function Badge({ look = 'default', children, ...rest }: {
  look?: BadgeLook;
  children: ReactNode;
} & { [data: `data-${string}`]: unknown }) {
  return <span className={LOOKS[look]} {...rest}>{children}</span>;
}

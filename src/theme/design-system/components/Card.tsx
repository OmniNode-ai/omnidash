/**
 * OMN-22168 AC4: the headline card of the Overview, which KpiStrip draws on Evidence, Runs and Usage: a panel article
 * carrying its accent colour and unavailable mark, its heading, then its figure and caption. The markup is the pages'
 * own, so nothing a page shows moves. The figure inside is the kit's Figure.
 */
import type { CSSProperties, ReactNode } from 'react';

type DataAttributes = { [data: `data-${string}`]: unknown };

export function Card({ heading, accent, unavailable, children, ...data }: {
  heading: ReactNode;
  /** The card's accent colour (--panel-accent), a token reference. */
  accent?: string;
  /** Marks the whole card unavailable; left out, the card carries no mark. */
  unavailable?: boolean;
  children: ReactNode;
} & DataAttributes) {
  return (
    <article className="local-dashboard-panel" data-field-unavailable={unavailable ? 'true' : undefined}
      style={{ '--panel-accent': accent } as CSSProperties} {...data}>
      <h2>{heading}</h2>
      {children}
    </article>
  );
}

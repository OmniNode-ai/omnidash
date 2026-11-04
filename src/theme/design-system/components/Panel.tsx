/**
 * OMN-22168 AC4: the panel every local page component sits in, which is also the card of the Overview headline figures
 * (a panel whose data-kind is metric_card), its title, and a card's headline figure. They replace the pages' hand-written
 * <article className="local-dashboard-panel">, <h2 className="local-dashboard-panel-title"> and
 * <p className="local-dashboard-metric">, with the same markup, so nothing a page shows moves.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type DataAttributes = { [data: `data-${string}`]: unknown };

export function Panel({ full = false, className, children, ...rest }: {
  /** The expanded chart's panel (local-dashboard-panel--full-chart). */
  full?: boolean;
  /** A class the page adds beside the panel's own (local-run-routing, local-runs-analysis). */
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & DataAttributes) {
  const classes = ['local-dashboard-panel', full ? 'local-dashboard-panel--full-chart' : null, className ?? null].filter(Boolean).join(' ');
  return <article className={classes} {...rest}>{children}</article>;
}

/** A panel's own title row, when the panel is not titled by its page component's heading. */
export function PanelTitle({ children, ...rest }: { children: ReactNode } & Omit<HTMLAttributes<HTMLHeadingElement>, 'className' | 'children'> & DataAttributes) {
  return <h2 className="local-dashboard-panel-title" {...rest}>{children}</h2>;
}

/**
 * A card's headline figure. measured sets data-measured, which keeps a figure that was not measured in the unavailable
 * ink; left out, the figure carries no mark, as the pages wrote it.
 */
export function Figure({ measured, title, style, children }: {
  measured?: boolean;
  title?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return <p className="local-dashboard-metric" data-measured={measured} title={title} style={style}>{children}</p>;
}

/** A window summary tile of the Overview's activity charts: a label, the figure and its notes (the small lines under it). */
export function KpiTile({ tone, label, value, unavailable, children }: {
  tone: string;
  label: ReactNode;
  value: ReactNode;
  /** Marks the figure unavailable; left out, the figure carries no mark. */
  unavailable?: boolean;
  children?: ReactNode;
}) {
  return <div className="ins-kpi local-dashboard-metric" data-field-tone={tone}><span>{label}</span><strong data-field-unavailable={unavailable}>{value}</strong>{children}</div>;
}

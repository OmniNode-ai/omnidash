/**
 * OMN-22168 AC4: the data table of the local pages and the usage widgets, which replaces their hand-written
 * <div className="local-dashboard-table-wrap"><table>. The wrap scrolls a wide table inside its panel; the page keeps
 * writing its own head and body, so every column, cell and sort control stays the page's. The markup is unchanged.
 */
import type { ReactNode, TableHTMLAttributes } from 'react';

type DataAttributes = { [data: `data-${string}`]: unknown };

export function DataTable({ fit = false, className, region, footer, children, ...table }: {
  /** The wrap that fits its panel's width (local-dashboard-table-wrap--fit). */
  fit?: boolean;
  /** A class the page adds to the wrap (local-runs-wrap, usage-matrix-wrap). */
  className?: string;
  /** Names the wrap as a region (a scrolling table a keyboard user can reach); the table keeps its own name. */
  region?: string;
  /** What sits in the wrap after the table (the savings days' pagination). */
  footer?: ReactNode;
  children: ReactNode;
} & Omit<TableHTMLAttributes<HTMLTableElement>, 'className' | 'children'> & DataAttributes) {
  const classes = ['local-dashboard-table-wrap', fit ? 'local-dashboard-table-wrap--fit' : null, className ?? null].filter(Boolean).join(' ');
  return (
    <div className={classes} role={region ? 'region' : undefined} aria-label={region}>
      <table {...table}>{children}</table>
      {footer}
    </div>
  );
}

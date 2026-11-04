/**
 * OMN-22168 AC4: the empty state of the local pages, which replaces the hand-written <p className="local-dashboard-empty">
 * on every page. It says what is not there in words and is announced as a status, as the pages did; a quiet cell (a
 * figure that is only "Not measured") passes status={false}. The markup is the pages' own, so nothing a page shows moves.
 */
import type { HTMLAttributes, ReactNode } from 'react';

export function EmptyState({ children, status = true, as: Tag = 'p', className, ...rest }: {
  children: ReactNode;
  /** Announced to assistive tech as a status (the pages' role="status"); false for a quiet "Not measured" cell. */
  status?: boolean;
  /** A block of more than one line (a heading and a list) is a div. */
  as?: 'p' | 'div';
  /** A class the page adds beside the empty state's own (ins-empty on the insight panels). */
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'role'> & { [data: `data-${string}`]: unknown }) {
  return <Tag className={className ? `local-dashboard-empty ${className}` : 'local-dashboard-empty'} role={status ? 'status' : undefined} {...rest}>{children}</Tag>;
}

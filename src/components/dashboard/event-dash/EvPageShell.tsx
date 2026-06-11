/**
 * OMN-12943 — page shell wrapping every ported event-dash view in `.ev-root`
 * (scopes all event-dash.css rules) plus a header and scroll body.
 */

import { type ReactNode } from 'react';
import '@/styles/event-dash.css';

export function EvPageShell({
  crumb,
  title,
  sub,
  headRight,
  children,
}: {
  crumb: string;
  title: string;
  sub: string;
  headRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ev-root">
      <div className="ev-page-head">
        <div className="ev-head-row">
          <div>
            <div className="ev-crumb">{crumb}</div>
            <div className="ev-title">{title}</div>
            <div className="ev-sub">{sub}</div>
          </div>
          {headRight ? <div className="ev-head-right">{headRight}</div> : null}
        </div>
      </div>
      <div className="ev-scroll">
        <div className="grid">{children}</div>
      </div>
    </div>
  );
}

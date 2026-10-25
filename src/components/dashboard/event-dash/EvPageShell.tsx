/**
 * OMN-12943 — page shell wrapping every ported event-dash view in `.ev-root`
 * (scopes all event-dash.css rules) plus a header and scroll body.
 */

import { type ReactNode } from 'react';
import type { AppPage } from '@/store/types';
import { DestinationIcon } from '@/navigation/destination-icons';
import '@/styles/event-dash.css';
import '@/styles/dashboard-cards.css';
import '@/styles/seven-page-design.css';

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
  const destination: AppPage | undefined = ({
    'Delegation Evidence': 'delegation-evidence',
    'Experimentation Platform': 'experiments',
    'Agent Workbench': 'sea-control', 'Event Bus': 'event-bus', Lab: 'lab',
  } as Record<string, AppPage>)[title];
  return (
    <main className="ev-root" aria-label={`${title} page`} data-destination={destination}>
      <div className="ev-page-head">
        <div className="ev-head-row">
          <div>
            {destination !== 'delegation-evidence' && <div className="ev-crumb">{crumb}</div>}
            <h1 className="ev-title">{destination && <span className="ev-title-icon"><DestinationIcon page={destination} size={20} /></span>}{title}</h1>
            {destination !== 'delegation-evidence' && <div className="ev-sub">{sub}</div>}
          </div>
          {headRight ? <div className="ev-head-right">{headRight}</div> : null}
        </div>
      </div>
      <div className="ev-scroll">
        <div className="grid">{children}</div>
      </div>
    </main>
  );
}

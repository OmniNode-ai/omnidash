/**
 * OMN-18771 — C4: the Lab tab shell.
 *
 * Parent OMN-18767. The tab is added on the same three-edit seam OMN-12943 used
 * for its four ported views: a member on the `AppPage` union, a `lazy()` import
 * plus a `case` arm in App.tsx, and one entry in the Sidebar nav array.
 *
 * WHAT THIS PAGE REFUSES TO DO, and why it is written this way.
 *
 * The archived dashboard shipped a topology view that rendered a checked-in
 * YAML graph as though it were observed wiring, so a topic whose consumer had
 * died still drew a healthy edge. It also shipped a wiring-status manifest
 * grading ~55 routes, where detection existed and enforcement did not, so the
 * stub list only ever grew. This page is the inverse of both: every row it
 * draws is derived from a live read, and anything it could not read is named as
 * unread rather than omitted or drawn as an empty success.
 *
 * The census is deliberately NOT a hardcoded topic array. `EventBusPage`'s
 * ProjectionHealth is the same shape and is honest about being a live census,
 * but it probes exactly two topics named in its own source. This widens that to
 * the catalog: the topic set comes from `GET /projections`, and reachability
 * comes from cross-referencing it against the bus-backed list. A topic the
 * catalog gains tomorrow appears here with no edit to this file, which is what
 * AC3's falsifier asserts.
 *
 * SCOPE AS SHIPPED. OMN-18772 (C5) adds, above the census: hook capture over
 * work.events, per-topic activity over topic-activity (OMN-19716; a typed empty
 * state until that exposure is bus-backed), the event trace over live-events,
 * delegation runs over delegation.decisions, and errors. The lane / lab-pass
 * dimensions from C2 (OMN-18769) and the runners view (C6) are not here yet.
 */

import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import { LabSystemStatus } from '@/components/dashboard/lab-system-status/LabSystemStatus';
import TopicActivityWidget from '@/components/dashboard/topic-activity/TopicActivityWidget';
import WorkEventsWidget from '@/components/dashboard/work-events/WorkEventsWidget';
import TraceExplorerWidget from '@/components/dashboard/trace-explorer/TraceExplorerWidget';
import ErrorsWidget from '@/components/dashboard/errors/ErrorsWidget';
import RoutingDecisionTable from '@/components/dashboard/routing/RoutingDecisionTable';

export function LabPage() {
  return (
    <EvPageShell
      crumb="Observability / Lab"
      title="Lab"
      sub="What is working in the lab — every panel over a projection, and anything unread named as unread"
    >
      {/* Ordered by the operator's question, "what is the lab generating right
          now": capture health first, then per-topic volume, the live tail,
          delegation runs and errors. The 65-row exposure census is last, because
          it is reference, not a live signal. */}
      <WorkEventsWidget config={{ view: 'hook-capture' }} />
      <TopicActivityWidget />
      <TraceExplorerWidget />
      <RoutingDecisionTable config={{ variant: 'lab-runs', pageSize: 25 }} />
      <ErrorsWidget config={{ window: '24h' }} />
      <LabSystemStatus />
    </EvPageShell>
  );
}

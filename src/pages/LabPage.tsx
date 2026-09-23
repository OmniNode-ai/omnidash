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
 * SCOPE AS SHIPPED. This is the tab shell plus the census section. The flow
 * triage and node-roster sections, and the lane / lab-pass dimensions that come
 * from C2 (OMN-18769), are not here yet; the ticket says C4 "ships honestly
 * partial" without C2, so their absence is stated rather than mocked.
 */

import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import { EvEmpty, Panel } from '@/components/dashboard/event-dash/primitives';
import { LabSystemStatus } from '@/components/dashboard/lab-system-status/LabSystemStatus';

export function LabPage() {
  return (
    <EvPageShell
      crumb="Observability / Lab"
      title="Lab"
      sub="What is working in the lab — every panel over a projection, and anything unread named as unread"
    >
      <LabSystemStatus />

      {/*
        C2 (OMN-18769) supplies the lane-census, runtime-health and lab-pass
        dimensions. It is not landed, so the section is declared and empty
        rather than absent: a reader should be able to tell that a dimension
        exists and has no producer yet, which is the distinction the archived
        dashboard's stub list lost.
      */}
      <Panel
        title="LANE HEALTH"
        sub="awaiting its producer — OMN-18769 (C2)"
        pad={false}
      >
        <EvEmpty
          title="No producer yet"
          reason="Lane census drift, runtime health dimensions and lab-pass verdicts arrive with OMN-18769 (C2)."
          note="Declared so its absence is visible. This is not zero rows reported as a healthy result."
        />
      </Panel>
    </EvPageShell>
  );
}

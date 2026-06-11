/**
 * OMN-12943 — Experimentation Platform (ported from prototype view-experiments.jsx).
 *
 * SOURCE: Claude Design prototype app/view-experiments.jsx (ExperimentsView).
 * This is the most upstream-blocked surface. Per the live :13002 census:
 *   - context.experiment-scores.v1 / baselines.roi.v1 → NOT SERVED (unknown_topic)
 *   - ab-compare.v1 → served but DEGRADED ("table 'public.llm_call_metrics' not found")
 *   - delegation.quality-gate.v1 + delegation.decisions.v1 → READY
 * The two blocked headline panels render explicit not-wired states (referencing
 * OMN-12082); AB-compare renders its honest degraded state from the envelope;
 * QualityDist is DERIVED from the real quality-gate + per-decision rows. No
 * data.jsx fixture ships, and nothing fabricates the unavailable projections.
 */

import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import {
  Badge,
  EvEmpty,
  Panel,
  fmtPct,
} from '@/components/dashboard/event-dash/primitives';
import {
  useAbCompare,
  useDelegationDecisions,
  useDelegationQualityGate,
} from '@/components/dashboard/event-dash/useEventDashData';

// ── quality score distribution (derived from real decisions + quality gate) ──

function QualityDist() {
  const { data: qData } = useDelegationQualityGate();
  const { data: dData } = useDelegationDecisions();
  const q = qData?.rows[0];
  const decisions = dData?.rows ?? [];

  if (!q && decisions.length === 0) {
    return (
      <Panel title="QUALITY SCORE DISTRIBUTION">
        <EvEmpty title="No quality data" reason={qData?.degradedReason ?? dData?.degradedReason} />
      </Panel>
    );
  }

  // Two honest bands derived from the live deterministic gate: fail (0) vs pass (1).
  // The prototype's 5-band fixture is NOT reproduced — the live gate is binary.
  const passed = q ? q.total_passed : decisions.filter((d) => d.quality_gate_passed).length;
  const failed = q ? q.total_failed : decisions.filter((d) => !d.quality_gate_passed).length;
  const bands = [
    { band: '0 · fail', count: failed },
    { band: '1 · pass', count: passed },
  ];
  const max = Math.max(1, ...bands.map((b) => b.count));
  const total = passed + failed;
  return (
    <Panel title="QUALITY SCORE DISTRIBUTION" sub={`n=${total} delegated runs · deterministic gate (binary)`}>
      <div className="ev-hist">
        {bands.map((b) => (
          <div className="ev-hist-col" key={b.band}>
            <div className="mono ev-hist-count">{b.count}</div>
            <div className="ev-hist-bar" style={{ height: `${(b.count / max) * 100}%` }} />
            <div className="mono ev-hist-label">{b.band}</div>
          </div>
        ))}
      </div>
      <div className="chart-axis ev-hist-axis">quality score band (0 = fail · 1 = full pass)</div>
    </Panel>
  );
}

// ── A/B model compare (degraded — backing table absent) ──────────────────────

function AbCompare() {
  const { data, isLoading } = useAbCompare();
  if (isLoading || !data) {
    return <Panel title="A/B MODEL COMPARE"><EvEmpty title="Loading…" /></Panel>;
  }
  if (data.rows.length === 0) {
    return (
      <Panel title="A/B MODEL COMPARE" right={<Badge kind="warn">degraded</Badge>}>
        <EvEmpty
          title="A/B compare projection degraded"
          reason={data.degradedReason ?? 'ab-compare.v1 returned no rows'}
          note="Backing table public.llm_call_metrics is not present in the projection DB. Rows will appear once the AB-compare emitter materializes."
        />
      </Panel>
    );
  }
  // (If/when the backing table lands, the rows render here — no mock fallback.)
  return (
    <Panel title="A/B MODEL COMPARE" sub="per model · live">
      {data.rows.map((r) => (
        <div className="barrow" key={r.model_name}>
          <div className="lab">{r.model_name}</div>
          <div className="val">{r.runs} runs · {fmtPct(r.pass_rate)}</div>
        </div>
      ))}
    </Panel>
  );
}

export function ExperimentsPage() {
  const decisionsQ = useDelegationDecisions();
  const headRight = decisionsQ.data ? <Badge kind="warn">experiment projections partially upstream-blocked</Badge> : null;

  return (
    <EvPageShell
      crumb="OmniDash · Experimentation"
      title="Experimentation Platform"
      sub="A/B model compare · context ablation · baseline ROI"
      headRight={headRight}
    >
      <Panel title="CONTEXT-INJECTION EXPERIMENT" right={<span className="src-tag">OMN-12082</span>}>
        <EvEmpty
          title="Context-effectiveness projection not wired"
          reason="topic onex.snapshot.projection.context.experiment-scores.v1 not served by the projection API (unknown_topic)"
          note="The paired A/B context-ablation study (DF-14) is a recorded-evidence surface until context_experiment_scores is materialized (OMN-12082). Not fabricated from fixtures."
        />
      </Panel>

      <Panel title="CONTEXT-EFFECTIVENESS HEATMAP" right={<Badge kind="muted">not wired</Badge>}>
        <EvEmpty
          title="Heatmap projection not served"
          reason="context.experiment-scores.v1 unavailable (unknown_topic)"
          note="Renders only when the experiment-scores projection lands; no mock heatmap."
        />
      </Panel>

      <AbCompare />

      <Panel title="BASELINES ROI" right={<Badge kind="muted">not wired</Badge>}>
        <EvEmpty
          title="Baselines ROI projection not served"
          reason="topic onex.snapshot.projection.baselines.roi.v1 not served (unknown_topic)"
          note="Promotion recommendations render once the baselines-roi projection is materialized."
        />
      </Panel>

      <QualityDist />

      <div className="note ev-exp-footer">
        Live delegation aggregates (quality gate, per-decision banding) back the QualityDist panel today. The richer A/B
        and context-ablation projections (context.experiment-scores, baselines.roi) are reported degraded / unknown by the
        current projection backend and render as explicit not-wired states rather than fixtures.
      </div>
    </EvPageShell>
  );
}

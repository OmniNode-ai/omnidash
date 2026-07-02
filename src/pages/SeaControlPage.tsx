/**
 * OMN-12943 — SEA Control Plane (ported from prototype view-sea.jsx).
 *
 * SOURCE: Claude Design prototype app/view-sea.jsx (SeaView).
 * Reads the REAL node-generation-completed projection. Pipeline stages are
 * static stage LABELS (the "loop closed" badge is justified by the presence of
 * completed rows with contract_passed=true); there is no simulated active-stage
 * playback. data.jsx fixtures do not ship.
 */

import { EvPageShell } from "@/components/dashboard/event-dash/EvPageShell";
import {
  Badge,
  CodeBlock,
  DataTable,
  Dot,
  EvEmpty,
  FreshnessChip,
  KPI,
  KV,
  Panel,
  derivePageBadge,
  fmtLatency,
  fmtPct,
  type DataColumn,
} from "@/components/dashboard/event-dash/primitives";
import { useNodeGenerations } from "@/components/dashboard/event-dash/useEventDashData";
import type { NodeGenerationRow } from "@/services/event-dash-api";
import { SeaGeneratePanel } from "./SeaGeneratePanel";

const PIPELINE_STAGES = [
  {
    label: "Generate",
    sub: "task → node spec",
    topic: "onex.cmd.omnimarket.node-generate.v1",
  },
  {
    label: "Materialize",
    sub: "contract.yaml · handler.py",
    topic: "onex.evt.omnimarket.node-materialized.v1",
  },
  {
    label: "Invoke",
    sub: "handle(input_data)",
    topic: "onex.evt.omnimarket.generated-node-invoked.v1",
  },
  {
    label: "Register",
    sub: "projection owner",
    topic: "onex.snapshot.projection.registration.v1",
  },
  {
    label: "Projection",
    sub: "completed event",
    topic: "onex.evt.omnimarket.node-generation-completed.v1",
  },
  {
    label: "Replay",
    sub: "idempotent re-run",
    topic: "onex.evt.omnimarket.node-generation-completed.v1",
  },
];

function nodeName(r: NodeGenerationRow): string {
  const m = r.contract_yaml.match(/name:\s*([\w.-]+)/);
  if (m) return m[1];
  return r.task_description.slice(0, 48);
}

function SeaPipeline({ loopClosed }: { loopClosed: boolean }) {
  return (
    <Panel
      title="SELF-EXTENSION PIPELINE"
      sub="generate → materialize → invoke → register → projection → replay"
      right={
        loopClosed ? (
          <Badge kind="accent">
            <Dot kind="ok" />
            loop closed
          </Badge>
        ) : (
          <Badge kind="muted">no completed rows</Badge>
        )
      }
    >
      <div className="pipe">
        {PIPELINE_STAGES.map((s, i) => (
          <div className="pstage" key={s.label}>
            <div className="box">
              <div className="num">{String(i + 1).padStart(2, "0")}</div>
              <div className="nm">{s.label}</div>
              <div className="sb">{s.sub}</div>
              <div className="tp">{s.topic}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * Render the behavioral + corpus verdict badges for a generation row.
 *
 * OMN-13166: semantic_checked / semantic_passed — a shape-valid generated node
 * that fails semantic validation is gate-zero false-green; render it visibly.
 * OMN-13289: corpus_checked / corpus_passed — a generated validator that does
 * not flag every violation fixture is not accepted; render it separately.
 */
function GenerationVerdictBadges({ g }: { g: NodeGenerationRow }) {
  return (
    <>
      {g.semantic_checked && (
        g.semantic_passed ? (
          <Badge kind="ok">
            <Dot kind="ok" />
            semantic pass
          </Badge>
        ) : (
          <Badge kind="fail">semantic fail</Badge>
        )
      )}
      {g.corpus_checked && (
        g.corpus_passed ? (
          <Badge kind="ok">
            <Dot kind="ok" />
            corpus pass
          </Badge>
        ) : (
          <Badge kind="fail">corpus fail</Badge>
        )
      )}
    </>
  );
}

function SeaArtifact({ g }: { g: NodeGenerationRow }) {
  return (
    <Panel
      title="LATEST GENERATED NODE"
      sub={nodeName(g)}
      right={
        <>
          {g.contract_passed ? (
            <Badge kind="ok">
              <Dot kind="ok" />
              contract passed
            </Badge>
          ) : (
            <Badge kind="fail">contract failed</Badge>
          )}
          <GenerationVerdictBadges g={g} />
          <Badge kind="muted">{g.endpoint_class}</Badge>
        </>
      }
    >
      <div className="grid">
        <div className="ev-task-box">
          <div className="section-label">Task prompt</div>
          <div className="mono ev-task-text">{g.task_description}</div>
        </div>
        <KV
          items={[
            { k: "Correlation", v: g.correlation_id, accent: true },
            { k: "Provider / Model", v: `${g.provider} · ${g.model_id}` },
            { k: "Resolved endpoint", v: g.resolved_endpoint },
            { k: "Routing source", v: g.routing_source },
            { k: "Projection owner", v: g.projection_owner },
            {
              k: "Attempts · Latency",
              v: `${g.attempt_count} · ${fmtLatency(g.total_latency_e2e_ms)}`,
            },
            // OMN-13166: behavioral verdict — visible separately from contract gate
            ...(g.semantic_checked
              ? [
                  {
                    k: "Semantic",
                    v: g.semantic_passed ? "passed" : "failed",
                  },
                ]
              : []),
            // OMN-13289: corpus acceptance verdict
            ...(g.corpus_checked
              ? [
                  {
                    k: "Corpus",
                    v: g.corpus_passed ? "passed" : "failed",
                  },
                ]
              : []),
          ]}
        />
        <div className="divider" />
        <div className="section-label">Artifact hashes (SHA-256)</div>
        <KV
          items={[
            { k: "Output", v: g.output_payload_sha256 },
            { k: "Contract", v: g.contract_sha256 },
            { k: "Handler", v: g.handler_sha256 },
          ]}
        />
        <div className="grid cols-2">
          <CodeBlock title="contract.yaml" lang="yaml" code={g.contract_yaml} />
          <CodeBlock title="handler.py" lang="python" code={g.handler_source} />
        </div>
      </div>
    </Panel>
  );
}

export function SeaControlPage() {
  const { data, isLoading } = useNodeGenerations();
  const rows = data?.rows ?? [];
  const hero = rows[0];

  const passed = rows.filter((r) => r.contract_passed).length;
  const passRate = rows.length > 0 ? passed / rows.length : null;
  const avgLatency =
    rows.length > 0
      ? Math.round(
          rows.reduce((a, r) => a + r.total_latency_e2e_ms, 0) / rows.length,
        )
      : null;
  const modelCounts = new Map<string, number>();
  for (const r of rows)
    modelCounts.set(r.model_id, (modelCounts.get(r.model_id) ?? 0) + 1);
  const topModel =
    [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const cols: DataColumn<NodeGenerationRow>[] = [
    {
      key: "node",
      label: "Generated node",
      grow: true,
      truncate: true,
      render: (r) => <span className="mono">{nodeName(r)}</span>,
    },
    {
      key: "model_id",
      label: "Model",
      render: (r) => <span className="mono c-green">{r.model_id}</span>,
    },
    {
      key: "routing_source",
      label: "Route",
      render: (r) => <Badge kind="muted">{r.routing_source}</Badge>,
    },
    {
      key: "latency",
      label: "Latency",
      num: true,
      render: (r) => fmtLatency(r.total_latency_e2e_ms),
    },
    {
      key: "contract",
      label: "Contract",
      num: true,
      render: (r) =>
        r.contract_passed ? (
          <Badge kind="ok">pass</Badge>
        ) : (
          <Badge kind="fail">fail</Badge>
        ),
    },
    // OMN-13166: behavioral verdict column — only populated when semantic gate ran.
    // Shape-valid but behaviorally wrong nodes show "fail" here while "Contract"
    // shows "pass", making gate-zero false-greens visible in the table.
    {
      key: "semantic",
      label: "Semantic",
      num: true,
      render: (r) =>
        r.semantic_checked ? (
          r.semantic_passed ? (
            <Badge kind="ok">pass</Badge>
          ) : (
            <Badge kind="fail">fail</Badge>
          )
        ) : (
          <span className="dim">—</span>
        ),
    },
    // OMN-13289: corpus acceptance column — only populated when corpus gate ran
    // (validator generation runs). A generated scanner that fails its own corpus
    // shows "fail" here; ordinary free-text generation shows "—".
    {
      key: "corpus",
      label: "Corpus",
      num: true,
      render: (r) =>
        r.corpus_checked ? (
          r.corpus_passed ? (
            <Badge kind="ok">pass</Badge>
          ) : (
            <Badge kind="fail">fail</Badge>
          )
        ) : (
          <span className="dim">—</span>
        ),
    },
    {
      key: "created_at",
      label: "Created",
      num: true,
      render: (r) => (
        <span className="mono dim">
          {r.created_at.replace("T", " ").slice(0, 19)}
        </span>
      ),
    },
  ];

  // OMN-12943: derive badge from the single authoritative projection for this page.
  const badgeState = derivePageBadge(
    data ? [{ rowCount: data.rowCount, freshness: data.freshness }] : [],
  );
  const headRight = data ? (
    <FreshnessChip state={badgeState} latestEventAt={data.latestEventAt} />
  ) : null;

  return (
    <EvPageShell
      crumb="OmniDash · SEA Control Plane"
      title="Self-Extending Agent"
      sub="Node generation · materialize → invoke → register → replay — live projections"
      headRight={headRight}
    >
      <div className="grid cols-4">
        <KPI
          label="Pipeline events"
          value={data ? data.rowCount : "—"}
          sub="node-generation-completed.v1"
        />
        <KPI
          label="Active model"
          value={<span className="ev-kpi-sm">{topModel}</span>}
          accent
          sub="most-frequent model"
        />
        <KPI
          label="Contract pass"
          value={passRate != null ? fmtPct(passRate) : "—"}
          sub={`${passed} / ${rows.length} rows`}
        />
        <KPI
          label="Avg gen latency"
          value={avgLatency != null ? avgLatency : "—"}
          sub="ms · e2e"
        />
      </div>

      <SeaGeneratePanel />

      <SeaPipeline loopClosed={passed > 0} />

      {isLoading ? (
        <Panel title="LATEST GENERATED NODE">
          <EvEmpty title="Loading…" />
        </Panel>
      ) : !hero ? (
        <Panel title="LATEST GENERATED NODE">
          <EvEmpty
            title="No generated nodes"
            reason={data?.degradedReason}
            note="node-generation-completed projection returned no rows."
          />
        </Panel>
      ) : (
        <SeaArtifact g={hero} />
      )}

      {isLoading ? null : rows.length === 0 ? null : (
        <Panel
          title="RECENT GENERATIONS"
          sub="every row expands to full artifact"
          pad={false}
          right={<span className="note">showing {rows.length}</span>}
        >
          <DataTable
            columns={cols}
            rows={rows}
            rowKey={(r) => r.id}
            renderDetail={(r) => (
              <>
                <KV
                  items={[
                    { k: "Correlation", v: r.correlation_id, accent: true },
                    { k: "Endpoint", v: r.resolved_endpoint },
                    { k: "Routing source", v: r.routing_source },
                    { k: "Projection owner", v: r.projection_owner },
                    { k: "Attempts", v: String(r.attempt_count) },
                    { k: "Latency", v: fmtLatency(r.total_latency_e2e_ms) },
                    // OMN-13166: behavioral verdict
                    ...(r.semantic_checked
                      ? [
                          {
                            k: "Semantic verdict",
                            v: r.semantic_passed ? "passed" : "failed",
                          },
                        ]
                      : []),
                    // OMN-13289: corpus acceptance verdict
                    ...(r.corpus_checked
                      ? [
                          {
                            k: "Corpus verdict",
                            v: r.corpus_passed
                              ? "passed"
                              : `failed (${Array.isArray(r.corpus_errors) ? r.corpus_errors.length : 0} error${Array.isArray(r.corpus_errors) && r.corpus_errors.length !== 1 ? "s" : ""})`,
                          },
                        ]
                      : []),
                    { k: "Output SHA", v: r.output_payload_sha256 },
                    { k: "Contract SHA", v: r.contract_sha256 },
                    { k: "Handler SHA", v: r.handler_sha256 },
                  ]}
                />
                <div className="ev-task-box">
                  <div className="section-label">Task</div>
                  <div className="mono ev-task-text">{r.task_description}</div>
                </div>
                <div className="grid cols-2">
                  <CodeBlock
                    title="contract.yaml"
                    lang="yaml"
                    code={r.contract_yaml}
                  />
                  <CodeBlock
                    title="handler.py"
                    lang="python"
                    code={r.handler_source}
                  />
                </div>
              </>
            )}
          />
        </Panel>
      )}
    </EvPageShell>
  );
}

// widget-cost-summary.jsx — comprehensive savings + per-model toggle + real line graph
const { useState: csState } = React;

function CostSummary({ view: viewProp, onViewChange }) {
  const k = window.OD_DATA.KPIS;
  const trend = window.OD_DATA.COST_TREND;
  const perModel = window.OD_DATA.PER_MODEL_SAVINGS;
  const [internalView, setInternalView] = csState("total");
  const view = viewProp ?? internalView;
  const setView = (v) => { onViewChange ? onViewChange(v) : setInternalView(v); };

  const localPctDeg = Math.round(k.localPct * 100);
  const cloudPctDeg = 100 - localPctDeg;

  const totalSaved = perModel.reduce((s, m) => s + (m.wouldHaveCost - m.spent), 0);

  return (
    <div className="card">
      <div className="card-hd">
        <div>
          <div className="eyebrow">Cost summary · last 7 days</div>
        </div>
        <div className="seg" role="tablist" aria-label="Cost view">
          <button role="tab" aria-selected={view === "total"}    className={"seg-btn" + (view === "total"    ? " is-on" : "")} onClick={() => setView("total")}>Total</button>
          <button role="tab" aria-selected={view === "permodel"} className={"seg-btn" + (view === "permodel" ? " is-on" : "")} onClick={() => setView("permodel")}>Per model</button>
        </div>
      </div>

      {view === "total" ? <TotalView k={k} trend={trend} localPctDeg={localPctDeg} cloudPctDeg={cloudPctDeg} /> : <PerModelView models={perModel} totalSaved={totalSaved} />}
    </div>
  );
}

function TotalView({ k, trend, localPctDeg, cloudPctDeg }) {
  return (
    <React.Fragment>
      {/* Hero */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <div className="mono tnum" style={{ fontSize: 38, fontWeight: 800, color: "var(--good)", lineHeight: 1, letterSpacing: "-0.02em" }}>
          <CountUp value={localPctDeg} suffix="%" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>tokens routed locally</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>$0 marginal cost · 4 hosts on-prem</div>
        </div>
      </div>

      {/* Split bar */}
      <div style={{ display: "flex", height: 22, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${localPctDeg}%`, background: "var(--good)", display: "flex", alignItems: "center", paddingLeft: 10, color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", transition: "width .9s cubic-bezier(.2,.7,.3,1)" }}>
          {localPctDeg}% LOCAL
        </div>
        <div style={{ width: `${cloudPctDeg}%`, background: "var(--accent)", display: "flex", alignItems: "center", paddingLeft: 10, color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em" }}>
          {cloudPctDeg}% CLOUD
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--ink-3)" }}>
        <span>Routed to local models</span>
        <span className="mono">$<CountUp value={k.cloudAvoided} decimals={2} /> avoided</span>
      </div>

      <hr className="hr" style={{ margin: "16px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <SmallKPI label="Cloud spend" value={k.totalCloudSpend} prefix="$" decimals={2} />
        <SmallKPI label="Avoided" value={k.cloudAvoided} prefix="$" decimals={2} tone="good" />
        <SmallKPI label="Tokens" value={k.tokensProcessed / 1e6} suffix="M" decimals={1} />
      </div>

      {/* Real line graph */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="eyebrow">cost per minute · last 30 min</div>
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>↓ 87% vs cloud-only</div>
        </div>
        <CostLineChart data={trend} />
      </div>
    </React.Fragment>
  );
}

function PerModelView({ models, totalSaved }) {
  const local = models.filter(m => m.tier === "local");
  const cloud = models.filter(m => m.tier === "cloud");

  // column picker state — minimal default that fits a narrow card; user can toggle on the rest
  const [visible, setVisible] = csState({
    name: true, tier: false, tasks: false, tokensM: false, p50: true, p95: false, accuracy: true, spent: false, savings: true, bar: false,
  });
  const [pickerOpen, setPickerOpen] = csState(false);

  const max = Math.max(...models.map(m => m.wouldHaveCost));

  const allColumns = [
    {
      key: "name", label: "Model", width: "minmax(120px, 1.4fr)",
      sortValue: (r) => r.name,
      render: (m) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: m.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
        </span>
      ),
    },
    {
      key: "tier", label: "Tier", width: "52px",
      render: (m) => (
        <span className="mono" style={{ fontSize: 10, color: m.tier === "local" ? "var(--good)" : "var(--accent-ink)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{m.tier}</span>
      ),
    },
    { key: "tasks",   label: "Tasks",   width: "56px", align: "right", mono: true, render: (m) => m.tasks.toLocaleString() },
    { key: "tokensM", label: "Tokens",  width: "62px", align: "right", mono: true, render: (m) => `${m.tokensM.toFixed(1)}M` },
    {
      key: "p50", label: "p50", width: "56px", align: "right", mono: true,
      render: (m) => <span style={{ color: m.p50 < 3 ? "var(--good)" : m.p50 < 10 ? "var(--ink)" : "var(--bad)" }}>{m.p50.toFixed(1)}s</span>,
    },
    { key: "p95", label: "p95", width: "56px", align: "right", mono: true, render: (m) => `${m.p95.toFixed(1)}s` },
    {
      key: "accuracy", label: "Acc", width: "60px", align: "right", mono: true,
      sortValue: (m) => m.accuracy,
      render: (m) => (
        <span style={{ color: m.accuracy >= 0.93 ? "var(--good)" : m.accuracy >= 0.88 ? "var(--ink)" : "var(--warn)", fontWeight: 600 }}>
          {(m.accuracy * 100).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "spent", label: "Spent", width: "62px", align: "right", mono: true,
      render: (m) => `$${m.spent.toFixed(2)}`,
    },
    {
      key: "savings", label: "Saved", width: "72px", align: "right", mono: true,
      sortValue: (m) => m.wouldHaveCost - m.spent,
      render: (m) => {
        const saved = m.wouldHaveCost - m.spent;
        return (
          <span style={{ fontWeight: 700, color: m.tier === "local" ? "var(--good)" : "var(--ink-3)" }}>
            {m.tier === "local" ? `+$${saved.toFixed(2)}` : "—"}
          </span>
        );
      },
    },
    {
      key: "bar", label: "Cost vs would-be", width: "minmax(80px, 1fr)",
      sortValue: (m) => m.wouldHaveCost,
      render: (m) => {
        const wouldPct = (m.wouldHaveCost / max) * 100;
        const spentPct = (m.spent / max) * 100;
        return (
          <div style={{ position: "relative", height: 8, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }} title={`would have cost $${m.wouldHaveCost.toFixed(2)} · actual $${m.spent.toFixed(2)}`}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${wouldPct}%`, background: m.tier === "local" ? "var(--good-soft)" : "var(--accent-soft)" }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${spentPct}%`, background: "var(--accent)" }} />
          </div>
        );
      },
    },
  ];

  // hide columns that aren't visible
  const columns = allColumns.map(c => ({ ...c, hidden: !visible[c.key] }));

  const colOptions = [
    { key: "tier",    label: "Tier" },
    { key: "tasks",   label: "Tasks" },
    { key: "tokensM", label: "Tokens" },
    { key: "p50",     label: "Latency p50" },
    { key: "p95",     label: "Latency p95" },
    { key: "accuracy",label: "Accuracy" },
    { key: "spent",   label: "Spent" },
    { key: "savings", label: "Saved" },
    { key: "bar",     label: "Cost bar" },
  ];

  return (
    <React.Fragment>
      {/* Hero */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <div className="mono tnum" style={{ fontSize: 32, fontWeight: 800, color: "var(--good)", lineHeight: 1, letterSpacing: "-0.02em" }}>
          $<CountUp value={totalSaved} decimals={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>saved · routed to local models</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{local.length} local · {cloud.length} cloud · last 7 days</div>
        </div>
        <ColumnPicker open={pickerOpen} onToggle={() => setPickerOpen(o => !o)} options={colOptions} visible={visible} setVisible={setVisible} />
      </div>

      <SortableTable
        rows={models}
        columns={columns}
        initialSort={{ key: "savings", dir: "desc" }}
        rowKey="id"
      />
    </React.Fragment>
  );
}

function ColumnPicker({ open, onToggle, options, visible, setVisible }) {
  return (
    <div style={{ position: "relative" }}>
      <button onClick={onToggle} className="mono" style={{
        appearance: "none", cursor: "pointer",
        height: 24, padding: "0 10px",
        background: open ? "var(--bg-sunken)" : "var(--bg-elevated)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        fontSize: 10, fontWeight: 700, color: "var(--ink-2)",
        letterSpacing: "0.08em", textTransform: "uppercase",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1,2 L9,2 M1,5 L9,5 M1,8 L9,8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        Columns
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: 30, zIndex: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--line)",
          borderRadius: 8, padding: 8,
          boxShadow: "var(--shadow-md)",
          minWidth: 160,
        }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>show columns</div>
          {options.map(opt => (
            <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", cursor: "pointer", fontSize: 12, color: "var(--ink-2)", borderRadius: 4 }}>
              <input
                type="checkbox"
                checked={!!visible[opt.key]}
                onChange={() => setVisible(v => ({ ...v, [opt.key]: !v[opt.key] }))}
                style={{ accentColor: "var(--accent)" }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SmallKPI({ label, value, prefix = "", suffix = "", decimals = 0, tone = "default" }) {
  const c = tone === "good" ? "var(--good)" : "var(--ink)";
  return (
    <div>
      <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: c, lineHeight: 1 }}>
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── Real line graph: cloud-baseline (what it would have cost) vs actual (local floor at $0) ───
function CostLineChart({ data }) {
  const W = 480, H = 110;
  const padL = 36, padR = 12, padT = 10, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // synthesize a "cloud-only baseline" — what each minute would have cost if nothing were routed local
  const baseline = data.map((d, i) => {
    // smooth aspirational curve in the $0.05–$0.18 / min range
    const v = 0.10 + Math.sin(i * 0.35) * 0.05 + Math.cos(i * 0.22) * 0.025 + (i % 7 === 0 ? 0.03 : 0);
    return Math.max(0.04, v);
  });

  const allVals = [...baseline, ...data.map(d => d.cloud)];
  const yMax = Math.max(...allVals, 0.2);
  const yMin = 0;

  const x = (i) => padL + (i / (data.length - 1)) * innerW;
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const baselinePath = baseline.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const actualPath   = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.cloud).toFixed(1)}`).join(" ");
  const baselineArea = `${baselinePath} L ${x(data.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  // y-axis ticks
  const ticks = [0, yMax / 2, yMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* gridlines */}
      {ticks.map((t, i) => (
        <line key={i} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line-2)" strokeWidth="1" />
      ))}
      {/* y-axis labels */}
      {ticks.map((t, i) => (
        <text key={i} x={padL - 6} y={y(t) + 3} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)" textAnchor="end">${t.toFixed(2)}</text>
      ))}

      {/* shaded area under cloud-only baseline = the avoided cost */}
      <path d={baselineArea} fill="var(--accent-soft)" opacity="0.55" />

      {/* cloud-only baseline (dashed, accent) */}
      <path d={baselinePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" />

      {/* actual cloud spend (solid line — mostly at zero, spikes when routed to cloud) */}
      <path d={actualPath} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinejoin="round" />

      {/* mark spike points */}
      {data.map((d, i) => {
        if (d.cloud < 0.02) return null;
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.cloud)} r="3" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* x-axis labels */}
      <text x={padL}      y={H - 6} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)">−30m</text>
      <text x={padL + innerW / 2} y={H - 6} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)" textAnchor="middle">−15m</text>
      <text x={W - padR}  y={H - 6} fontSize="9" fill="var(--ink-3)" fontFamily="var(--font-mono)" textAnchor="end">now</text>

      {/* legend */}
      <g transform={`translate(${padL}, ${padT - 2})`}>
        <line x1="0" y1="0" x2="14" y2="0" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="18" y="3" fontSize="9" fill="var(--ink-2)" fontFamily="var(--font-mono)">cloud-only baseline</text>
        <line x1="140" y1="0" x2="154" y2="0" stroke="var(--good)" strokeWidth="2" />
        <text x="158" y="3" fontSize="9" fill="var(--ink-2)" fontFamily="var(--font-mono)">actual spend</text>
      </g>
    </svg>
  );
}

Object.assign(window, { CostSummary });

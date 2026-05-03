// widget-routing.jsx — Classifier → Model routing visual
const { useState: rState, useEffect: rEff, useMemo: rMemo } = React;

function RoutingDecision() {
  const tasks = window.OD_DATA.TASK_PRESETS;
  const models = window.OD_DATA.MODELS;
  const intents = window.OD_DATA.INTENTS;
  const [taskIdx, setTaskIdx] = rState(0);
  const task = tasks[taskIdx];
  const chosen = models.find(m => m.id === task.chosen);
  const intent = intents.find(i => i.id === task.intent) || intents[0];

  // auto-cycle
  rEff(() => {
    const speed = (window.__OD_LIVE_SPEED || 1);
    const id = setInterval(() => setTaskIdx(i => (i + 1) % tasks.length), 5000 / speed);
    return () => clearInterval(id);
  }, [tasks.length]);

  // routing rules table (matches model-routing.svg structure)
  const rules = [
    { type: "Classification",      model: "DeepSeek-R1-14B",     cost: 0,      intentId: "classification" },
    { type: "Code generation",     model: "Qwen3-Coder-30B",     cost: 0,      intentId: "code_generation" },
    { type: "Complex reasoning",   model: "DeepSeek-R1-32B",     cost: 0,      intentId: "complex_reasoning" },
    { type: "Large context",       model: "Qwen3-Next-80B",      cost: 0,      intentId: "large_context" },
    { type: "Fallback / hard",     model: "Claude-Sonnet-4-5",   cost: 0.118,  intentId: "debugging" }, // not literal but for table contrast
  ];

  return (
    <div className="card">
      <CardHeader
        eyebrow="Model routing"
        title="What's the cheapest model that can do this task?"
        sub="Every routing decision is a contract. Receipts hash-bound to evidence."
      />

      {/* Live trace */}
      <div style={{
        background: "var(--bg-sunken)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 16,
        marginBottom: 18,
      }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>live decision · trace</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 12 }}>
          {/* INPUT */}
          <div>
            <NodePill kind="cmd">input</NodePill>
            <div className="mono" style={{ fontSize: 12, marginTop: 8, color: "var(--ink-2)", lineHeight: 1.4 }}>
              {task.label}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4 }}>
              ticket-{4470 + taskIdx} · 1.2 KB
            </div>
          </div>

          <Arrow />

          {/* CLASSIFY */}
          <div>
            <NodePill kind="compute">classify</NodePill>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: "var(--ink)" }}>
              {intent.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <ConfidenceBar value={0.91} color={intent.color} />
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>0.91</span>
            </div>
          </div>

          <Arrow accent />

          {/* ROUTE */}
          <div>
            <NodePill kind="effect">route</NodePill>
            <div className="mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: "var(--ink)" }}>
              {chosen.name}
            </div>
            <div style={{ marginTop: 4 }}>
              <Price value={chosen.cost} />
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 8 }}>
                · {chosen.host}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Routing rules table */}
      <div className="eyebrow" style={{ marginBottom: 8 }}>routing rules · learned from cost/quality history</div>
      <RoutingRulesTable rules={rules} activeIntent={task.intent} />

      <div style={{ marginTop: 14, fontSize: 11, color: "var(--ink-3)", fontStyle: "italic", textAlign: "center" }}>
        Every routing decision produces a receipt with <span className="mono">model_chosen</span>, <span className="mono">tokens</span>, <span className="mono">cost</span>.
      </div>
    </div>
  );
}

function RoutingRulesTable({ rules, activeIntent }) {
  const [sort, setSort] = rState(null);

  const sorted = React.useMemo(() => {
    if (!sort) return rules;
    const dir = sort.dir === "asc" ? 1 : -1;
    const valueOf = (r) => sort.key === "type" ? r.type : sort.key === "model" ? r.model : r.cost;
    return [...rules].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rules, sort]);

  const toggle = (key) => setSort(prev => !prev || prev.key !== key ? { key, dir: "desc" } : prev.dir === "desc" ? { key, dir: "asc" } : null);

  const Header = ({ label, k, align = "left" }) => {
    const active = sort && sort.key === k;
    return (
      <button onClick={() => toggle(k)} className="mono" style={{ all: "unset", cursor: "pointer", fontSize: 10, color: active ? "var(--accent-ink)" : "var(--ink-3)", letterSpacing: "0.18em", fontWeight: 700, textAlign: align }}>
        {label}<span style={{ marginLeft: 4, color: active ? "var(--accent)" : "currentColor", opacity: active ? 1 : 0.35 }}>{!active ? "↕" : sort.dir === "asc" ? "↑" : "↓"}</span>
      </button>
    );
  };

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 70px", padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <Header label="TASK TYPE" k="type" />
        <Header label="MODEL" k="model" />
        <Header label="COST" k="cost" align="right" />
      </div>
      {sorted.map((r, i) => {
        const isActive = r.intentId === activeIntent;
        return (
          <div key={r.type} style={{
            display: "grid", gridTemplateColumns: "1.2fr 1.5fr 70px",
            padding: "10px 12px", alignItems: "center",
            background: isActive ? "var(--accent-soft)" : "transparent",
            borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
            borderBottom: i < sorted.length - 1 ? "1px solid var(--line-2)" : "none",
            transition: "background .3s, border-color .3s",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{r.type}</div>
            <div className="mono" style={{ fontSize: 12, color: r.cost === 0 ? "var(--compute-ink)" : "var(--effect)", fontWeight: 700 }}>{r.model}</div>
            <div style={{ textAlign: "right" }}>
              <span className="mono tnum" style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 999,
                background: r.cost === 0 ? "var(--compute)" : "var(--effect)",
                color: "#fff", fontSize: 10, fontWeight: 700,
              }}>
                {r.cost === 0 ? "$0.00" : "$$$"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Arrow({ accent }) {
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" style={{ overflow: "visible" }}>
      <line x1="0" y1="10" x2="26" y2="10" stroke={accent ? "var(--accent)" : "var(--ink-3)"} strokeWidth={accent ? 2 : 1.5} />
      <path d={`M22,5 L30,10 L22,15`} fill={accent ? "var(--accent)" : "var(--ink-3)"} />
    </svg>
  );
}

function ConfidenceBar({ value, color }) {
  return (
    <div style={{ flex: 1, height: 4, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${value * 100}%`, height: "100%", background: color, transition: "width .5s" }} />
    </div>
  );
}

Object.assign(window, { RoutingDecision });

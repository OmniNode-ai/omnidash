// widget-ab-compare.jsx — AB Cost Compare as expandable task list
const { useState: abState, useMemo: abMemo } = React;

function TaskListItem({ task, expanded, onToggle, metaphor }) {
  const models = window.OD_DATA.MODELS;
  const chosen = models.find(m => m.id === task.chosen);
  const cloudCost = 0.118;
  const winnerCost = chosen?.cost ?? 0;
  const dollars = Math.max(0, cloudCost - winnerCost);
  const pct = cloudCost > 0 ? Math.round((dollars / cloudCost) * 100) : 0;
  const intentLabel = (window.OD_DATA.INTENTS.find(i => i.id === task.intent) || {}).label || task.intent;

  return (
    <div style={{
      borderBottom: "1px solid var(--line-2)",
      transition: "background .15s",
      background: expanded ? "var(--bg-sunken)" : "transparent",
    }}>
      {/* summary row */}
      <button onClick={onToggle} style={{
        all: "unset", display: "grid",
        gridTemplateColumns: "20px 1fr 110px 90px 90px",
        alignItems: "center", gap: 14,
        width: "100%", padding: "10px 14px",
        cursor: "pointer", boxSizing: "border-box",
      }}>
        <Caret open={expanded} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.label}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}>{intentLabel}</div>
        </div>
        <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: chosen.tier === "local" ? "var(--good)" : "var(--effect)", whiteSpace: "nowrap" }}>
          {chosen.name.split("-").slice(0, 2).join("-")}
        </div>
        <div className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: winnerCost === 0 ? "var(--good)" : "var(--effect)", textAlign: "right" }}>
          {winnerCost === 0 ? "FREE" : `$${winnerCost.toFixed(3)}`}
        </div>
        <div className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: "var(--good)", textAlign: "right" }}>
          +{pct}%
        </div>
      </button>

      {/* details */}
      {expanded && (
        <div style={{ padding: "8px 14px 18px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
          <PromptBlock prompt={task.prompt} />
          {metaphor === "ledger"   && <LedgerDetail models={models} chosenId={chosen?.id} dollars={dollars} />}
          {metaphor === "lollipop" && <LollipopDetail models={models} chosenId={chosen?.id} />}
          {metaphor === "race"     && <RaceDetail models={models} chosenId={chosen?.id} />}
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontStyle: "italic" }}>
            <span className="mono">correlation_id: 0xa31f…b8c4</span> · receipt signed by deepseek-r1-32b
          </div>
        </div>
      )}
    </div>
  );
}

function Caret({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transition: "transform .15s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
      <path d="M3,1 L7,5 L3,9" stroke="var(--ink-3)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Prompt block: shows the actual prompt routed to the model ──
function PromptBlock({ prompt }) {
  const [open, setOpen] = abState(false);
  const [copied, setCopied] = abState(false);
  if (!prompt) return null;
  const preview = prompt.length > 96 ? prompt.slice(0, 96) + "…" : prompt;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 10px", boxSizing: "border-box",
      }}>
        <Caret open={open} />
        <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.16em", textTransform: "uppercase" }}>Prompt</span>
        {!open && <span style={{ fontSize: 11, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, fontStyle: "italic" }}>{preview}</span>}
        <span style={{ flex: open ? 1 : 0 }} />
        <span onClick={copy} className="mono" style={{
          padding: "2px 8px", borderRadius: 4,
          background: copied ? "var(--good-soft)" : "var(--bg-sunken)",
          color: copied ? "var(--good)" : "var(--ink-3)",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        }}>{copied ? "Copied" : "Copy"}</span>
      </button>
      {open && (
        <pre className="mono" style={{
          margin: 0, padding: "10px 12px 12px 32px",
          background: "var(--bg-sunken)",
          fontSize: 11, lineHeight: 1.55, color: "var(--ink-2)",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          borderTop: "1px solid var(--line-2)",
          maxHeight: 220, overflowY: "auto",
        }}>{prompt}</pre>
      )}
    </div>
  );
}

// ── Compact detail variants ──
function LedgerDetail({ models, chosenId, dollars }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 6, padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, paddingBottom: 6, borderBottom: "1px solid var(--ink)" }}>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-2)", letterSpacing: "0.16em" }}>MODEL</div>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--good)", letterSpacing: "0.16em", textAlign: "right" }}>CREDIT</div>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--bad)", letterSpacing: "0.16em", textAlign: "right" }}>DEBIT</div>
      </div>
      {models.map((m, i) => {
        const isWinner = m.id === chosenId;
        const free = m.cost === 0;
        return (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, padding: "5px 0", borderBottom: i < models.length - 1 ? "1px dashed var(--line-2)" : "none", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {isWinner && <span style={{ color: "var(--accent)", fontSize: 10 }}>★</span>}
              <span className="mono" style={{ fontSize: 11, fontWeight: isWinner ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>· {m.host}</span>
            </div>
            <div className="mono tnum" style={{ fontSize: 11, color: free ? "var(--good)" : "var(--ink-4)", textAlign: "right" }}>
              {free ? `+ $0.118` : "—"}
            </div>
            <div className="mono tnum" style={{ fontSize: 11, color: free ? "var(--ink-4)" : "var(--bad)", textAlign: "right" }}>
              {free ? "—" : `– $${m.cost.toFixed(3)}`}
            </div>
          </div>
        );
      })}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 10, padding: "8px 0 2px", borderTop: "1.5px solid var(--ink)", marginTop: 4 }}>
        <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>Net</div>
        <div></div>
        <div className="mono tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--good)", textAlign: "right" }}>+ ${dollars.toFixed(3)}</div>
      </div>
    </div>
  );
}

function LollipopDetail({ models, chosenId }) {
  const W = 480;
  const max = 0.20;
  const x = (cost) => {
    if (cost <= 0) return 8;
    const t = Math.log10(cost * 1000 + 1) / Math.log10(max * 1000 + 1);
    return 8 + t * (W - 16);
  };
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 6, padding: 10 }}>
      {models.map(m => {
        const xc = x(m.cost);
        const isWinner = m.id === chosenId;
        const color = m.tier === "local" ? "var(--good)" : m.cost > 0.05 ? "var(--bad)" : "var(--warn)";
        return (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 60px", alignItems: "center", gap: 10, height: 22 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: isWinner ? 600 : 400, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
            <div style={{ position: "relative", height: "100%" }}>
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--line-2)" }} />
              <div style={{ position: "absolute", top: "50%", left: 8, width: xc - 8, height: 1.5, background: color, opacity: 0.4, transform: "translateY(-50%)" }} />
              <div style={{ position: "absolute", top: "50%", left: xc, transform: "translate(-50%,-50%)", width: isWinner ? 10 : 7, height: isWinner ? 10 : 7, borderRadius: "50%", background: color, boxShadow: isWinner ? "0 0 0 3px var(--accent-glow)" : "none" }} />
            </div>
            <span className="mono tnum" style={{ fontSize: 10, color: m.cost === 0 ? "var(--good)" : "var(--bad)", textAlign: "right", fontWeight: 600 }}>
              {m.cost === 0 ? "FREE" : `$${m.cost.toFixed(3)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RaceDetail({ models, chosenId }) {
  const max = Math.max(...models.map(m => m.cost), 0.001);
  const sorted = [...models].sort((a, b) => a.cost - b.cost);
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 6, padding: 10 }}>
      {sorted.map((m, i) => {
        const isWinner = m.id === chosenId;
        const color = m.tier === "local" ? "var(--good)" : m.cost > 0.05 ? "var(--bad)" : "var(--warn)";
        const w = m.cost === 0 ? 6 : 6 + (m.cost / max) * 90;
        return (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "20px 140px 1fr 60px", alignItems: "center", gap: 8, height: 24 }}>
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)", textAlign: "right" }}>{i + 1}</span>
            <span className="mono" style={{ fontSize: 10, fontWeight: isWinner ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
            <div style={{ position: "relative", height: 14, background: "var(--bg-sunken)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: `${w}%`, background: color, opacity: 0.85 }} />
              {m.cost === 0 && <span className="mono" style={{ position: "absolute", left: 6, top: 1, fontSize: 9, fontWeight: 700, color: "#fff" }}>FREE</span>}
            </div>
            <span className="mono tnum" style={{ fontSize: 10, color: m.cost === 0 ? "var(--good)" : "var(--bad)", textAlign: "right", fontWeight: 600 }}>
              {m.cost === 0 ? "—" : `$${m.cost.toFixed(3)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Container ───
function ABCompareHero({ metaphor = "ledger" }) {
  const tasks = window.OD_DATA.TASK_PRESETS;
  const [openId, setOpenId] = abState(tasks[0].id);
  const [sort, setSort] = abState(null); // { key, dir }

  // aggregate
  const totals = abMemo(() => {
    const cloud = tasks.length * 0.118;
    let local = 0;
    tasks.forEach(t => {
      const m = window.OD_DATA.MODELS.find(x => x.id === t.chosen);
      local += m?.cost || 0;
    });
    const saved = cloud - local;
    return { saved, pct: Math.round((saved / cloud) * 100), tasks: tasks.length };
  }, [tasks]);

  const sortedTasks = abMemo(() => {
    if (!sort) return tasks;
    const dir = sort.dir === "asc" ? 1 : -1;
    const valueOf = (t) => {
      const m = window.OD_DATA.MODELS.find(x => x.id === t.chosen);
      switch (sort.key) {
        case "task":   return t.label;
        case "routed": return m?.name || "";
        case "cost":   return m?.cost ?? 0;
        case "saved":  return Math.max(0, 0.118 - (m?.cost ?? 0));
        default:       return 0;
      }
    };
    return [...tasks].sort((a, b) => {
      const av = valueOf(a), bv = valueOf(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tasks, sort]);

  const toggleSort = (key) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  };

  const HeaderCell = ({ label, sortKey, align = "left" }) => {
    const active = sort && sort.key === sortKey;
    const arrow = !active ? "↕" : (sort.dir === "asc" ? "↑" : "↓");
    return (
      <button
        onClick={() => toggleSort(sortKey)}
        className="mono"
        style={{
          all: "unset", cursor: "pointer",
          fontSize: 9, fontWeight: 700,
          color: active ? "var(--accent-ink)" : "var(--ink-3)",
          letterSpacing: "0.16em", textAlign: align,
          width: "100%", boxSizing: "border-box",
        }}
      >
        {label}
        <span style={{ display: "inline-block", marginLeft: 4, color: active ? "var(--accent)" : "currentColor", opacity: active ? 1 : 0.35 }}>{arrow}</span>
      </button>
    );
  };

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div>
          <div className="eyebrow">A/B model cost compare · last 5 tasks</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: "var(--ink-2)" }}>Tap any task to see the prompt + receipt.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div className="mono tnum" style={{ fontSize: 24, fontWeight: 800, color: "var(--good)", lineHeight: 1 }}>
              <CountUp value={totals.pct} suffix="%" />
            </div>
            <div className="eyebrow" style={{ color: "var(--good)", marginTop: 3 }}>saved</div>
          </div>
          <div style={{ width: 1, height: 28, background: "var(--line)" }} />
          <div style={{ textAlign: "right" }}>
            <div className="mono tnum" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
              <CountUp value={totals.saved} prefix="$" decimals={3} />
            </div>
            <div className="eyebrow" style={{ marginTop: 3 }}>vs cloud-only</div>
          </div>
        </div>
      </div>

      {/* sortable column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 110px 90px 90px", gap: 14, padding: "8px 14px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div></div>
        <HeaderCell label="TASK" sortKey="task" />
        <HeaderCell label="ROUTED TO" sortKey="routed" />
        <HeaderCell label="COST" sortKey="cost" align="right" />
        <HeaderCell label="SAVED" sortKey="saved" align="right" />
      </div>

      {sortedTasks.map(t => (
        <TaskListItem
          key={t.id}
          task={t}
          expanded={openId === t.id}
          onToggle={() => setOpenId(openId === t.id ? null : t.id)}
          metaphor={metaphor}
        />
      ))}
    </div>
  );
}

Object.assign(window, { ABCompareHero });

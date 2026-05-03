// dashboard.jsx — main shell, tabs, density toggle
const { useState: dsState, useEffect: dsEff } = React;

function Sidebar() {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      borderRight: "1px solid var(--line)",
      background: "var(--bg-elevated)",
      padding: "20px 16px",
      display: "flex", flexDirection: "column", gap: 24,
      minHeight: "100vh",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: "var(--ink)", position: "relative" }}>
          <div style={{ position: "absolute", inset: 4, border: "2px solid var(--accent)", borderRadius: 2 }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>OmniDash</div>
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.18em", textTransform: "uppercase" }}>by omninode</div>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Dashboards</div>
        <NavItem label="Cost Savings" active count="5" />
        <NavItem label="Routing" />
        <NavItem label="Receipts" />
        <NavItem label="Live Bus" />
      </div>

      <div style={{ marginTop: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Cluster</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ClusterRow host=".201" desc="Linux GPU · vLLM" status="ok" />
          <ClusterRow host=".200" desc="Mac Studio · MLX" status="ok" />
          <ClusterRow host="cloud" desc="Claude · GPT" status="standby" />
        </div>
      </div>
    </aside>
  );
}

function NavItem({ label, active, count }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 10px", borderRadius: 6,
      background: active ? "var(--bg-sunken)" : "transparent",
      color: active ? "var(--ink)" : "var(--ink-2)",
      cursor: "pointer",
      borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
      fontSize: 13, fontWeight: active ? 600 : 500,
    }}>
      <span>{label}</span>
      {count && <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{count}</span>}
    </div>
  );
}

function ClusterRow({ host, desc, status }) {
  const color = status === "ok" ? "var(--good)" : status === "standby" ? "var(--warn)" : "var(--bad)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: status === "ok" ? `0 0 0 3px ${color}28` : "none" }} />
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>{host}</span>
      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{desc}</span>
    </div>
  );
}

function TopBar({ tab, setTab }) {
  const tabs = [
    { id: "cost", label: "Cost", count: "$487 saved" },
    { id: "routing", label: "Routing" },
    { id: "receipts", label: "Receipts" },
    { id: "bus", label: "Live Bus" },
  ];
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 28px", borderBottom: "1px solid var(--line)",
      background: "var(--bg-elevated)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-3)" }}>
          <span>Home</span><span>›</span><span>Dashboards</span><span>›</span><span style={{ color: "var(--ink)", fontWeight: 600 }}>Cost Savings</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="chip">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--good)" }} />
          dogfood
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>v1.4.0</span>
      </div>
    </header>
  );
}

// One full dashboard with given variant config — used inside the design canvas
function DashboardScreen({ config = {} }) {
  const cfg = {
    metaphor: "ledger",
    bus: "bold",
    showReceipts: true,
    ...config,
  };
  const [tab, setTab] = dsState("cost");
  return (
    <div style={{
      display: "flex",
      background: "var(--bg)",
      color: "var(--ink)",
      minHeight: "100vh",
      width: "100%",
      fontFamily: "var(--font-sans)",
    }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar tab={tab} setTab={setTab} />
        <main style={{ padding: 28, flex: 1, overflow: "hidden" }}>
          {tab === "cost" && (
            <CostTab cfg={cfg} />
          )}
          {tab === "routing" && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
              <RoutingDecision />
              <CostSummary />
            </div>
          )}
          {tab === "receipts" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <ReceiptGate />
              <RoutingDecision />
            </div>
          )}
          {tab === "bus" && (
            <BusTab cfg={cfg} />
          )}
        </main>
      </div>
    </div>
  );
}

function CostTab({ cfg }) {
  const [costView, setCostView] = dsState("total");
  const isPerModel = costView === "permodel";

  if (isPerModel) {
    // Per-model mode: full-width Cost Summary on top so the table has breathing room
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <CostSummary view={costView} onViewChange={setCostView} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ABCompareHero metaphor={cfg.metaphor} />
            {cfg.bus === "subtle"   && <LiveBusSubtle />}
            {cfg.bus === "bold"     && <LiveBusBold />}
            {cfg.bus === "cinematic" && <LiveBusCinematic />}
          </div>
          {cfg.showReceipts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <ReceiptGate />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "2fr 1fr",
      gap: 20,
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ABCompareHero metaphor={cfg.metaphor} />
        {cfg.bus === "subtle" && <LiveBusSubtle />}
        {cfg.bus === "bold" && <LiveBusBold />}
        {cfg.bus === "cinematic" && <LiveBusCinematic />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <CostSummary view={costView} onViewChange={setCostView} />
        {cfg.showReceipts && <ReceiptGate />}
      </div>
    </div>
  );
}

function BusTab({ cfg }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <LiveBusSubtle />
      <LiveBusBold />
      <LiveBusCinematic />
      <RoutingDecision />
    </div>
  );
}

Object.assign(window, { DashboardScreen });

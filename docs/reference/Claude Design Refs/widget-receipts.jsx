// widget-receipts.jsx — Receipt gate verdict
const { useState: rcState, useEffect: rcEff } = React;

function ReceiptGate() {
  const allGates = window.OD_DATA.RECEIPT_GATES;
  const [revealed, setRevealed] = rcState(0);

  rcEff(() => {
    const id = setInterval(() => {
      setRevealed(r => r >= allGates.length ? r : r + 1);
    }, 220);
    return () => clearInterval(id);
  }, [allGates.length]);

  const passed = allGates.filter(g => g.pass).length;
  const total = allGates.length;
  const allPass = revealed >= total && passed === total;

  return (
    <div className="card">
      <CardHeader
        eyebrow="Receipt gate · PR #4471"
        title="Independent verifier signed."
        right={
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 6,
            background: allPass ? "var(--good-soft)" : "var(--bg-sunken)",
            color: allPass ? "var(--good)" : "var(--ink-3)",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
          }}>
            <Stamp pass={allPass} />
            {allPass ? "MERGED" : "VERIFYING…"}
          </div>
        }
      />

      {/* progress meter */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div className="mono tnum" style={{ fontSize: 28, fontWeight: 800, color: "var(--good)" }}>
          {Math.min(revealed, passed)}<span style={{ color: "var(--ink-3)", fontSize: 18, fontWeight: 600 }}>/{total}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ color: "var(--good)" }}>gates passed</div>
          <div style={{ height: 4, background: "var(--line)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${(revealed / total) * 100}%`, height: "100%", background: "var(--good)", transition: "width .25s" }} />
          </div>
        </div>
      </div>

      {/* gates list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {allGates.map((g, i) => {
          const shown = i < revealed;
          return (
            <div key={g.id} style={{
              display: "grid", gridTemplateColumns: "20px 1fr auto",
              alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: i < allGates.length - 1 ? "1px dashed var(--line-2)" : "none",
              opacity: shown ? 1 : 0.25,
              transition: "opacity .3s",
            }}>
              <div>{shown && <CheckMark pass={g.pass} />}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{g.name}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.detail}</div>
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.16em", fontWeight: 700 }}>g.{String(i + 1).padStart(2, "0")}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "var(--bg-sunken)", borderRadius: 6, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.6 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>receipt manifest</div>
        <div className="mono">
          worker: <span style={{ color: "var(--compute-ink)" }}>qwen3-coder-30b</span><br/>
          verifier: <span style={{ color: "var(--reducer-ink)" }}>deepseek-r1-32b</span><br/>
          evidence: <span style={{ color: "var(--ink)" }}>12 artifacts · sha256:0xa31f…b8c4</span><br/>
          signed: <span style={{ color: "var(--ink)" }}>2026-05-03T17:42:08Z</span>
        </div>
      </div>
    </div>
  );
}

function CheckMark({ pass }) {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: 4,
      background: pass ? "var(--good)" : "var(--bad)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10">
        {pass
          ? <path d="M2,5 L4.5,7.5 L8.5,3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M3,3 L7,7 M7,3 L3,7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        }
      </svg>
    </div>
  );
}

function Stamp({ pass }) {
  return (
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: pass ? "var(--good)" : "var(--ink-3)", boxShadow: pass ? `0 0 0 3px var(--good-soft)` : "none" }} />
  );
}

Object.assign(window, { ReceiptGate });

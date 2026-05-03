// primitives.jsx — small reusable building blocks
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Count-up: animates 0 → value once on mount, then on value change ───
function useCountUp(value, { duration = 900, decimals = 0 } = {}) {
  const [v, setV] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return v.toFixed(decimals);
}

function CountUp({ value, prefix = "", suffix = "", decimals = 0, duration = 900, className }) {
  const v = useCountUp(value, { duration, decimals });
  return <span className={className}>{prefix}{Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

// ─── Eyebrow + KPI tile ───
function KPI({ label, value, prefix = "", suffix = "", decimals = 0, tone = "default", caption, big = false }) {
  const toneColor =
    tone === "good"   ? "var(--good)" :
    tone === "warn"   ? "var(--warn)" :
    tone === "bad"    ? "var(--bad)"  :
    tone === "accent" ? "var(--accent)" :
    "var(--ink)";
  return (
    <div className="kpi">
      <div className="kpi-num tnum" style={{ color: toneColor, fontSize: big ? 56 : "var(--kpi-num)" }}>
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="kpi-label">{label}</div>
      {caption && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, fontStyle: "italic" }}>{caption}</div>}
    </div>
  );
}

// ─── Node-type pill (matches deck color system) ───
function NodePill({ kind, children }) {
  const map = {
    orchestrator: ["var(--orchestrator-soft)", "var(--orchestrator-ink)", "var(--orchestrator)"],
    compute:      ["var(--compute-soft)",      "var(--compute-ink)",      "var(--compute)"],
    effect:       ["var(--effect-soft)",       "var(--effect-ink)",       "var(--effect)"],
    reducer:      ["var(--reducer-soft)",      "var(--reducer-ink)",      "var(--reducer)"],
    cmd:          ["var(--accent-soft)",       "var(--accent-ink)",       "var(--accent)"],
  };
  const [bg, fg, dot] = map[kind] || map.cmd;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      height: 20, padding: "0 8px",
      background: bg, color: fg,
      borderRadius: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.12 + "em", textTransform: "uppercase",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />
      {children || kind}
    </span>
  );
}

// ─── Dot leader (typographic separator) ───
function Leader({ count = 12 }) {
  return (
    <span style={{
      flex: 1, margin: "0 8px",
      borderBottom: "1px dotted var(--line)",
      transform: "translateY(-4px)",
    }} />
  );
}

// ─── Section header with eyebrow ───
function CardHeader({ eyebrow, title, sub, right }) {
  return (
    <div className="card-hd">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{title}</div>}
        {sub && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, fontStyle: "italic" }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Mono price tag ───
function Price({ value, big = false }) {
  const free = value === 0;
  const formatted = free ? "FREE" : "$" + value.toFixed(value < 0.01 ? 4 : 3);
  return (
    <span className="mono tnum" style={{
      fontSize: big ? 18 : 12,
      fontWeight: 700,
      color: free ? "var(--good)" : value > 0.05 ? "var(--bad)" : "var(--warn)",
      letterSpacing: free ? 0.1 + "em" : 0,
    }}>{formatted}</span>
  );
}

// ─── Sparkline (tiny inline trend) ───
function Sparkline({ data, w = 80, h = 24, color = "var(--accent)" }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 0.001);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// expose
Object.assign(window, { useCountUp, CountUp, KPI, NodePill, Leader, CardHeader, Price, Sparkline, SortableTable, useSort });

// ─── Sortable table primitive ───
// columns: [{ key, label, align?, width?, render?(row) → ReactNode, sortValue?(row) → primitive, mono?, hidden? }]
// initialSort: { key, dir: 'asc'|'desc' }
function useSort(rows, initialSort, columns) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[sort.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);
  const onSort = useCallback((key) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }, []);
  return { sorted, sort, onSort };
}

function SortArrow({ active, dir }) {
  if (!active) return <span style={{ display: "inline-block", width: 8, marginLeft: 4, opacity: 0.25 }}>↕</span>;
  return <span style={{ display: "inline-block", width: 8, marginLeft: 4, color: "var(--accent)" }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

function SortableTable({ rows, columns, initialSort, rowKey = "id", dense = false, onRowClick, rowStyle }) {
  const visibleCols = columns.filter(c => !c.hidden);
  const { sorted, sort, onSort } = useSort(rows, initialSort, visibleCols);
  const gridTemplate = visibleCols.map(c => c.width || "1fr").join(" ");
  const padY = dense ? 5 : 8;
  // sum minimum widths from declared widths to set a min-width on the grid for scroll
  const minWidth = visibleCols.reduce((sum, c) => {
    const w = c.width || "1fr";
    if (w.endsWith("px")) return sum + parseInt(w);
    const mm = /minmax\((\d+)px/.exec(w);
    if (mm) return sum + parseInt(mm[1]);
    return sum + 80; // 1fr fallback
  }, 0) + (visibleCols.length - 1) * 12 + 24; // gaps + padding

  return (
    <div className="sortable-table" style={{ overflowX: "auto", maxWidth: "100%" }}>
      <div style={{ minWidth }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 12, padding: "8px 12px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          {visibleCols.map(col => {
            const active = sort && sort.key === col.key;
            return (
              <button
                key={col.key}
                onClick={() => onSort(col.key)}
                className="mono"
                style={{
                  appearance: "none", border: 0, background: "transparent", padding: 0, cursor: "pointer",
                  textAlign: col.align || "left",
                  fontSize: 9, fontWeight: 700, color: active ? "var(--accent-ink)" : "var(--ink-3)",
                  letterSpacing: "0.16em", textTransform: "uppercase",
                }}
                title={`Sort by ${col.label}`}
              >
                {col.label}<SortArrow active={active} dir={active ? sort.dir : null} />
              </button>
            );
          })}
        </div>
        {/* rows */}
        {sorted.map((row, i) => (
          <div
            key={row[rowKey] ?? i}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              display: "grid", gridTemplateColumns: gridTemplate, gap: 12,
              padding: `${padY}px 12px`,
              borderBottom: i < sorted.length - 1 ? "1px solid var(--line-2)" : "none",
              cursor: onRowClick ? "pointer" : "default",
              alignItems: "center",
              ...(typeof rowStyle === "function" ? rowStyle(row, i) : {}),
            }}
          >
            {visibleCols.map(col => (
              <div
                key={col.key}
                className={col.mono ? "mono tnum" : ""}
                style={{ fontSize: 12, textAlign: col.align || "left", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
              >
                {col.render ? col.render(row) : row[col.key]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// widget-livebus.jsx — Live Event Stream, three variants
const { useState: lbState, useEffect: lbEff, useRef: lbRef, useMemo: lbMemo } = React;

const TPL = () => window.OD_DATA.EVENT_TEMPLATES;

function nowStamp(offset = 0) {
  const d = new Date(Date.now() - offset);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function useLiveEvents({ max = 30, baseInterval = 1100 } = {}) {
  const [events, setEvents] = lbState(() =>
    TPL().slice(0, 8).map((e, i) => ({ ...e, id: "seed-" + i, t: nowStamp((8 - i) * 900) }))
  );
  lbEff(() => {
    let cancelled = false;
    let counter = 0;
    const tick = () => {
      if (cancelled) return;
      const speed = (window.__OD_LIVE_SPEED || 1);
      const tpl = TPL();
      const e = tpl[Math.floor(Math.random() * tpl.length)];
      setEvents(prev => [{ ...e, id: "e-" + (++counter) + "-" + Math.random(), t: nowStamp() }, ...prev].slice(0, max));
      setTimeout(tick, baseInterval / speed + Math.random() * 300);
    };
    const id = setTimeout(tick, baseInterval);
    return () => { cancelled = true; clearTimeout(id); };
  }, [max, baseInterval]);
  return events;
}

const NODE_KIND = (e) =>
  e.node === "orchestrator" ? "orchestrator" :
  e.node === "compute"      ? "compute" :
  e.node === "effect"       ? "effect" :
  e.node === "reducer"      ? "reducer" : "cmd";

// shared column header strip — bus has too much going on for full sortable, but we can label cols
function BusHeader({ cols }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols.template, gap: 12, padding: "6px 12px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", marginBottom: 6 }}>
      {cols.labels.map((l, i) => (
        <div key={i} className="mono" style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.16em", textTransform: "uppercase", textAlign: l.align || "left" }}>{l.text}</div>
      ))}
    </div>
  );
}

// ─── Variant A: Subtle ─── soft fades, gentle pulse on activity
function LiveBusSubtle() {
  const events = useLiveEvents({ max: 14 });
  return (
    <div className="card">
      <CardHeader
        eyebrow="Live event bus · subtle"
        title="Every command, every event, every receipt."
        right={<HeartbeatChip events={events} />}
      />
      <BusHeader cols={{ template: "84px 110px 160px 1fr", labels: [{ text: "Time" }, { text: "Node" }, { text: "Topic" }, { text: "Detail" }] }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {events.slice(0, 9).map((e, i) => (
          <div
            key={e.id}
            style={{
              display: "grid",
              gridTemplateColumns: "84px 110px 160px 1fr",
              gap: 12, alignItems: "center",
              padding: "8px 12px",
              borderRadius: 6,
              background: i === 0 ? "var(--accent-soft)" : "transparent",
              opacity: 1 - i * 0.05,
              transition: "background 1.2s ease-out",
            }}
          >
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{e.t}</span>
            <NodePill kind={NODE_KIND(e)}>{e.type}</NodePill>
            <span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.topic}</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Variant B: Bold ─── visible heartbeat strip + animated rows
function LiveBusBold() {
  const events = useLiveEvents({ max: 12 });
  // build heartbeat 60-tick history
  const [pulses, setPulses] = lbState(Array(60).fill(0));
  lbEff(() => {
    setPulses(p => [Math.random() * 0.8 + 0.2, ...p].slice(0, 60));
  }, [events.length]);

  return (
    <div className="card">
      <CardHeader
        eyebrow="Live event bus · bold"
        title="onex.evt · onex.cmd"
        right={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{events.length} evt/min</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--good)", boxShadow: "0 0 0 3px rgba(21,128,61,.18)" }} />
          </span>
        }
      />

      {/* heartbeat strip */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 36, marginBottom: 14, padding: "8px", background: "var(--bg-sunken)", borderRadius: 6 }}>
        {pulses.map((v, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(4, v * 100)}%`,
            background: i === 0 ? "var(--accent)" : "var(--accent-soft)",
            borderRadius: 1,
            transition: "height .2s ease-out",
          }} />
        ))}
      </div>

      <BusHeader cols={{ template: "76px 96px 200px 1fr", labels: [{ text: "Time" }, { text: "Node" }, { text: "Topic" }, { text: "Detail" }] }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {events.slice(0, 8).map((e, i) => (
          <div key={e.id}
            style={{
              display: "grid", gridTemplateColumns: "76px 96px 200px 1fr",
              gap: 12, alignItems: "center",
              padding: "8px 12px",
              borderLeft: `3px solid ${i === 0 ? "var(--accent)" : "transparent"}`,
              background: i === 0 ? "var(--accent-soft)" : "transparent",
              animation: i === 0 ? "od-slidein .3s ease-out" : "none",
              borderRadius: 4,
            }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{e.t.slice(0, 8)}</span>
            <NodePill kind={NODE_KIND(e)}>{e.type}</NodePill>
            <span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.topic}</span>
            <span style={{ fontSize: 11, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Variant C: Cinematic ─── events fly from topic into a node tile
function LiveBusCinematic() {
  const events = useLiveEvents({ max: 8 });
  const counts = lbMemo(() => {
    const c = { orchestrator: 0, compute: 0, effect: 0, reducer: 0 };
    events.forEach(e => { c[NODE_KIND(e)] = (c[NODE_KIND(e)] || 0) + 1; });
    return c;
  }, [events]);
  const recent = events[0];

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <CardHeader
        eyebrow="Live event bus · cinematic"
        title="Topic → node, in flight."
        right={<HeartbeatChip events={events} />}
      />

      <div style={{ position: "relative", height: 220, background: "var(--bg-sunken)", borderRadius: 8, padding: 16 }}>
        {/* topic strip on left */}
        <div style={{ position: "absolute", left: 16, top: 16, bottom: 16, width: 140 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>topic</div>
          <div style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--line)",
            borderRadius: 6, padding: 10, height: "calc(100% - 24px)",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
          }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--accent-ink)" }}>onex.cmd.*</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--accent-ink)" }}>onex.evt.*</div>
            <div style={{ height: 1, background: "var(--line-2)", margin: "6px 0" }} />
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>kafka · 3 brokers</div>
            {recent && (
              <div className="mono" style={{ fontSize: 8, color: "var(--accent)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ↗ {recent.topic.split(".").slice(-2).join(".")}
              </div>
            )}
          </div>
        </div>

        {/* connecting lines */}
        <svg style={{ position: "absolute", left: 156, top: 16, right: 16, bottom: 16, width: "calc(100% - 172px)", height: "calc(100% - 32px)" }} preserveAspectRatio="none" viewBox="0 0 200 188">
          {[0, 1, 2, 3].map(i => {
            const y = 24 + i * 48;
            return <line key={i} x1="0" y1="94" x2="200" y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 3" />;
          })}
          {recent && (
            <circle r="3" fill="var(--accent)">
              <animateMotion dur={`${1.4 / (window.__OD_LIVE_SPEED || 1)}s`} repeatCount="1"
                path={`M 0 94 L 200 ${24 + ["orchestrator","compute","effect","reducer"].indexOf(NODE_KIND(recent)) * 48}`} />
            </circle>
          )}
        </svg>

        {/* node tiles on right */}
        <div style={{ position: "absolute", right: 16, top: 16, bottom: 16, width: 220, display: "flex", flexDirection: "column", gap: 6, justifyContent: "space-between" }}>
          {["orchestrator", "compute", "effect", "reducer"].map(k => {
            const isHot = recent && NODE_KIND(recent) === k;
            const map = {
              orchestrator: "var(--orchestrator)",
              compute: "var(--compute)",
              effect: "var(--effect)",
              reducer: "var(--reducer)",
            };
            return (
              <div key={k} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 6,
                background: "var(--bg-elevated)",
                border: `1px solid ${isHot ? map[k] : "var(--line)"}`,
                boxShadow: isHot ? `0 0 0 3px ${map[k]}30` : "var(--shadow-sm)",
                transition: "all .3s",
              }}>
                <NodePill kind={k} />
                <span className="mono tnum" style={{ fontSize: 14, fontWeight: 700, color: isHot ? map[k] : "var(--ink-3)" }}>
                  {counts[k] || 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* recent events tickertape */}
      <div style={{ marginTop: 14 }}>
        <BusHeader cols={{ template: "76px 96px 180px 1fr", labels: [{ text: "Time" }, { text: "Node" }, { text: "Topic" }, { text: "Detail" }] }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {events.slice(0, 3).map(e => (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "76px 96px 180px 1fr", gap: 12, alignItems: "center", padding: "6px 12px" }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{e.t.slice(0, 8)}</span>
              <NodePill kind={NODE_KIND(e)}>{e.type}</NodePill>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.topic}</span>
              <span style={{ fontSize: 11, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeartbeatChip({ events }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 999, background: "var(--good-soft)", color: "var(--good)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--good)", boxShadow: "0 0 0 3px " + "rgba(21,128,61,.18)" }} />
      LIVE · {events.length}/min
    </span>
  );
}

// inject keyframes once
if (typeof document !== "undefined" && !document.getElementById("od-anims")) {
  const s = document.createElement("style");
  s.id = "od-anims";
  s.textContent = `
    @keyframes od-slidein { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes od-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { LiveBusSubtle, LiveBusBold, LiveBusCinematic });

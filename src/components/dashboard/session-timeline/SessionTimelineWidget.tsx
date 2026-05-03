/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useState, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';

interface TimelineEvent {
  intent_id: string;
  session_ref: string;
  intent_category: string;
  confidence: number;
  keywords: string[];
  created_at: string;
}

type ViewMode = 'chart' | 'list';

const CATEGORY_COLORS: Record<string, string> = {
  debugging: 'var(--effect)',
  code_generation: 'var(--reducer)',
  refactoring: 'var(--orchestrator)',
  testing: 'var(--good)',
  documentation: 'var(--ink-3)',
  analysis: 'var(--accent)',
  code_review: 'var(--bad)',
  deployment: 'var(--warn)',
  unknown: 'var(--ink-4)',
};

function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'var(--good)';
  if (confidence >= 0.7) return 'var(--accent)';
  if (confidence >= 0.5) return 'var(--warn)';
  return 'var(--bad)';
}

function formatCategory(category: string): string {
  return category.replace(/_/g, ' ');
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Scatter Chart ────────────────────────────────────────────────────

function ScatterChart({ events }: { events: TimelineEvent[] }) {
  const categories = useMemo(() => {
    const cats = [...new Set(events.map((e) => e.intent_category))];
    cats.sort();
    return cats;
  }, [events]);

  const timeRange = useMemo(() => {
    if (events.length === 0) return { min: 0, max: 1 };
    const times = events.map((e) => new Date(e.created_at).getTime()).filter((t) => !Number.isNaN(t));
    if (times.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min, max: max === min ? max + 1 : max };
  }, [events]);

  const SVG_W = 600;
  const SVG_H = Math.max(200, categories.length * 40 + 60);
  const PAD = { top: 20, right: 20, bottom: 30, left: 120 };
  const plotW = SVG_W - PAD.left - PAD.right;
  const plotH = SVG_H - PAD.top - PAD.bottom;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Y-axis category labels */}
      {categories.map((cat, i) => {
        const y = PAD.top + (i + 0.5) * (plotH / categories.length);
        return (
          <g key={cat}>
            <line
              x1={PAD.left}
              x2={SVG_W - PAD.right}
              y1={y}
              y2={y}
              stroke="var(--line-2)"
              strokeDasharray="2,4"
            />
            <text x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="var(--ink-2)" fontSize={11}>
              {formatCategory(cat)}
            </text>
          </g>
        );
      })}

      {/* Dots */}
      {events.map((ev) => {
        const t = new Date(ev.created_at).getTime();
        if (Number.isNaN(t)) return null;
        const catIdx = categories.indexOf(ev.intent_category);
        if (catIdx < 0) return null;
        const x = PAD.left + ((t - timeRange.min) / (timeRange.max - timeRange.min)) * plotW;
        const y = PAD.top + (catIdx + 0.5) * (plotH / categories.length);
        const r = 3 + ev.confidence * 5;
        return (
          <circle
            key={ev.intent_id}
            cx={x}
            cy={y}
            r={r}
            fill={confidenceColor(ev.confidence)}
            opacity={0.4 + ev.confidence * 0.6}
          >
            <title>{`${ev.intent_category} (${(ev.confidence * 100).toFixed(0)}%) ${formatTime(ev.created_at)}`}</title>
          </circle>
        );
      })}

      {/* X-axis time labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const t = timeRange.min + frac * (timeRange.max - timeRange.min);
        const x = PAD.left + frac * plotW;
        const d = new Date(t);
        const label = Number.isNaN(d.getTime()) ? '' : formatTime(d.toISOString());
        return (
          <text key={frac} x={x} y={SVG_H - 8} textAnchor="middle" fill="var(--ink-3)" fontSize={10}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Timeline List ────────────────────────────────────────────────────

function TimelineList({ events }: { events: TimelineEvent[] }) {
  return (
    <div
      style={{
        maxHeight: 360,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {events.map((ev) => {
        const confColor = confidenceColor(ev.confidence);
        return (
          <div
            key={ev.intent_id}
            data-testid="timeline-row"
            style={{
              display: 'flex',
              gap: 12,
              padding: '8px 12px',
              borderBottom: '1px solid var(--line-2)',
              alignItems: 'flex-start',
            }}
          >
            {/* Colored dot */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: colorForCategory(ev.intent_category),
                flexShrink: 0,
                marginTop: 4,
              }}
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Top line: category chip + confidence + time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="chip">
                  {formatCategory(ev.intent_category)}
                </span>
                <span className="mono tnum" style={{ color: confColor, "fontWeight": 600 }}>
                  {(ev.confidence * 100).toFixed(0)}%
                </span>
                <span className="mono tnum" style={{ "color": 'var(--ink-3)' }}>
                  {formatDate(ev.created_at)} {formatTime(ev.created_at)}
                </span>
              </div>

              {/* Keywords */}
              {ev.keywords.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ev.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="chip"
                      style={{ height: 18, padding: '0 6px' }}
                    >
                      <Text size="xs" family="mono" color="secondary">{kw}</Text>
                    </span>
                  ))}
                </div>
              )}

              {/* Session ref */}
              <Text size="xs" family="mono" color="tertiary" truncate>
                {ev.session_ref}
              </Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Widget ──────────────────────────────────────────────────────

export default function SessionTimelineWidget() {
  const [mode, setMode] = useState<ViewMode>('chart');

  const { data, isLoading, error } = useProjectionQuery<TimelineEvent>({
    topic: TOPICS.intentClassification,
    queryKey: ['session-timeline'],
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data]);

  const isEmpty = sorted.length === 0 && !isLoading;

  // Segmented control for Chart | List toggle
  const modeToggle = (
    <div className="seg">
      {(['chart', 'list'] as const).map((m) => (
        <button
          key={m}
          type="button"
          className={`seg-btn${mode === m ? ' is-on' : ''}`}
          onClick={() => setMode(m)}
        >
          {m === 'chart' ? 'Chart' : 'List'}
        </button>
      ))}
    </div>
  );

  return (
    <ComponentWrapper
      title="Session Timeline"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No session timeline data"
      emptyHint="Timeline data appears after intent classification runs"
      headerExtra={modeToggle}
    >
      {mode === 'chart' ? (
        <ScatterChart events={sorted} />
      ) : (
        <TimelineList events={sorted} />
      )}
    </ComponentWrapper>
  );
}

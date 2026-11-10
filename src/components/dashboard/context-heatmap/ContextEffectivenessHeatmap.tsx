import { useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useContextHeatmap } from './useContextHeatmap';
import { classifyCell } from './context-heatmap.types';
import type { HeatmapCell, ContextHeatmapConfig, HeatmapSignal } from './context-heatmap.types';
import { localeString as fmtLocaleString } from '@/lib/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in ContextEffectivenessHeatmap.static.css.
import './ContextEffectivenessHeatmap.static.css';

// ── Color helpers ────────────────────────────────────────────────────────────

function signalBg(signal: HeatmapSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--ds-ok, var(--ds-ok)) 20%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--ds-bad, var(--ds-bad)) 20%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--ds-warn, var(--ds-hue-amber)) 15%, transparent)';
    case 'unknown': return 'var(--ds-surface-2)';
  }
}

function signalBorder(signal: HeatmapSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--ds-ok, var(--ds-ok)) 40%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--ds-bad, var(--ds-bad)) 40%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--ds-warn, var(--ds-hue-amber)) 30%, transparent)';
    case 'unknown': return 'var(--ds-line-soft)';
  }
}

function signalTextColor(signal: HeatmapSignal): 'ok' | 'bad' | 'warn' | 'tertiary' {
  switch (signal) {
    case 'helpful': return 'ok';
    case 'harmful': return 'bad';
    case 'neutral': return 'warn';
    case 'unknown': return 'tertiary';
  }
}

// ── Matrix cell ──────────────────────────────────────────────────────────────

function MatrixCell({
  cell,
  isSelected,
  onClick,
}: {
  cell: HeatmapCell | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (cell == null) {
    return (
      <div className="context-effectiveness-heatmap-s4c7d68"
      >
        <Text as="span" size="xs" color="tertiary">—</Text>
      </div>
    );
  }

  const signal = classifyCell(cell);
  const pct = cell.totalCount > 0 ? Math.round(cell.passRate * 100) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 72,
        height: 52,
        border: `1px solid ${isSelected ? 'var(--ds-brand)' : signalBorder(signal)}`,
        borderRadius: 6,
        background: isSelected ? 'var(--ds-surface-2)' : signalBg(signal),
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        outline: isSelected ? '2px solid var(--ds-brand)' : 'none',
        outlineOffset: 1,
      }}
    >
      {pct != null ? (
        <>
          <Text as="span" size="xs" weight="semibold" color={signalTextColor(signal)}>
            {pct}%
          </Text>
          <Text as="span" size="xs" color="tertiary">
            {cell.passCount}/{cell.totalCount}
          </Text>
        </>
      ) : (
        <Text as="span" size="xs" color="tertiary">—</Text>
      )}
    </button>
  );
}

// ── Examples panel ───────────────────────────────────────────────────────────

function ExamplesPanel({ cell, segmentLabel }: { cell: HeatmapCell; segmentLabel: string }) {
  const signal = classifyCell(cell);
  const tokenDeltaStr = cell.tokenDelta != null
    ? cell.tokenDelta > 0
      ? `saved ${fmtLocaleString(Math.round(cell.tokenDelta))} tokens avg`
      : cell.tokenDelta < 0
      ? `added ${fmtLocaleString(Math.round(-cell.tokenDelta))} tokens avg`
      : 'no token impact'
    : null;

  const avgTokens = cell.totalCount > 0 ? Math.round(cell.totalTokens / cell.totalCount) : 0;

  const exampleLines: string[] = [];
  if (signal === 'helpful' && tokenDeltaStr != null) {
    exampleLines.push(`${segmentLabel} removed → ${tokenDeltaStr}, improved quality`);
    exampleLines.push(`Pass rate: ${Math.round(cell.passRate * 100)}% (${cell.passCount}/${cell.totalCount} runs)`);
  } else if (signal === 'harmful') {
    exampleLines.push(`${segmentLabel} present → quality degraded (${cell.passCount}/${cell.totalCount} passed)`);
    if (tokenDeltaStr != null) exampleLines.push(`Token impact: ${tokenDeltaStr}`);
  } else if (signal === 'neutral') {
    exampleLines.push(`${segmentLabel} shows mixed results for ${cell.modelId}`);
    exampleLines.push(`Pass rate: ${Math.round(cell.passRate * 100)}% — only helps when paired with golden_chain`);
  }

  return (
    <div
      style={{
        border: `1px solid ${signalBorder(signal)}`,
        borderRadius: 8,
        padding: 12,
        background: signalBg(signal),
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div className="context-effectiveness-heatmap-s2833f2">
        <Text as="div" size="sm" weight="semibold" color={signalTextColor(signal)}>
          {segmentLabel} × {cell.modelId}
        </Text>
        <div
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${signalBorder(signal)}`,
            background: 'transparent',
          }}
        >
          <Text as="span" size="xs" weight="semibold" color={signalTextColor(signal)}>
            {signal.toUpperCase()}
          </Text>
        </div>
      </div>

      <div className="context-effectiveness-heatmap-sa97c72">
        <div>
          <Text as="div" size="xs" color="tertiary">Pass rate</Text>
          <Text as="div" size="xs" color="secondary">
            {cell.passCount}/{cell.totalCount} ({Math.round(cell.passRate * 100)}%)
          </Text>
        </div>
        <div>
          <Text as="div" size="xs" color="tertiary">Avg tokens</Text>
          <Text as="div" size="xs" color="secondary">
            {fmtLocaleString(avgTokens)}
          </Text>
        </div>
        {cell.tokenDelta != null && (
          <div>
            <Text as="div" size="xs" color="tertiary">Token delta</Text>
            <Text
              as="div"
              size="xs"
              color={cell.tokenDelta > 0 ? 'ok' : cell.tokenDelta < 0 ? 'bad' : 'secondary'}
            >
              {cell.tokenDelta > 0 ? '−' : '+'}{fmtLocaleString(Math.abs(Math.round(cell.tokenDelta)))}
            </Text>
          </div>
        )}
      </div>

      {exampleLines.length > 0 && (
        <div className="context-effectiveness-heatmap-s5c5eae">
          {exampleLines.map((line, i) => (
            <Text key={i} as="div" size="xs" color="secondary">
              {line}
            </Text>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items: Array<{ signal: HeatmapSignal; label: string; detail: string }> = [
    { signal: 'helpful', label: 'Helpful', detail: '≥75% pass rate' },
    { signal: 'neutral', label: 'Neutral / Mixed', detail: '26–74% pass rate' },
    { signal: 'harmful', label: 'Harmful', detail: '≤25% pass rate' },
  ];
  return (
    <div className="context-effectiveness-heatmap-sb7f7d3">
      {items.map(({ signal, label, detail }) => (
        <div className="context-effectiveness-heatmap-s3e64da" key={signal}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: signalBg(signal),
              border: `1px solid ${signalBorder(signal)}`,
              flexShrink: 0,
            }}
          />
          <Text as="span" size="xs" color="secondary">{label}</Text>
          <Text as="span" size="xs" color="tertiary">({detail})</Text>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────────────────

export default function ContextEffectivenessHeatmap({ config: _config = {} }: { config: ContextHeatmapConfig }) {
  const snapshot = useContextHeatmap();
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);

  const selectedCell = selectedCellKey != null
    ? (snapshot.cells.find((c) => `${c.segmentId}::${c.modelId}` === selectedCellKey) ?? null)
    : null;

  const selectedSegmentLabel = selectedCell != null
    ? (snapshot.segments.find((s) => s.id === selectedCell.segmentId)?.label ?? selectedCell.segmentId)
    : '';

  const isInitialLoading = snapshot.isLoading && !snapshot.hasAnyData;
  // Empty state keys on renderable segments, not raw row count (OMN-14895
  // D2): segments are now derived directly from the live rows (D1), so a
  // nonzero score count always yields at least one renderable segment —
  // this stays keyed on `segments.length` rather than `hasAnyData` so a
  // future re-introduction of a fixed/allow-listed segment set fails safe
  // (empty grid) instead of rendering a blank table with a nonzero footer.
  const isEmpty = !snapshot.isLoading && snapshot.segments.length === 0;

  return (
    <ComponentWrapper
      title="Context Effectiveness"
      isLoading={isInitialLoading}
      error={snapshot.error}
      isEmpty={isEmpty}
      emptyMessage="No experiment scores"
      emptyHint={
        snapshot.degradedReason ??
        'context_roi_scores projection is served but has no rows yet. Renders once a context-ROI run completes and node_projection_context_roi materializes its rows (OMN-12955).'
      }
      // This widget reads context_roi_scores exclusively via the live
      // projection HTTP path (event-dash-api.ts is architected live-only,
      // no fixture path) — it never honors file-mode data-source overrides,
      // so it always reports isLive and never claims a "File Mode" badge it
      // cannot back (OMN-14895 D3: the removed useProjectionQuery path
      // genuinely read through the active source; this one does not, so the
      // badge must not imply it does). In file mode the query surfaces an
      // honest error (`projectionUrl()` throws) rather than fabricated data.
      isLive
    >
      <div className="context-effectiveness-heatmap-sb0831f">

        {/* Legend */}
        <Legend />

        {/* Matrix */}
        <div className="context-effectiveness-heatmap-s42d445">
          <table className="context-effectiveness-heatmap-sa8c150">
            <thead>
              <tr>
                <th className="context-effectiveness-heatmap-sde3068">
                  <Text as="span" size="xs" color="tertiary">Segment</Text>
                </th>
                {snapshot.models.map((model) => (
                  <th className="context-effectiveness-heatmap-sb799cd" key={model}>
                    <Text as="span" size="xs" color="secondary">{model}</Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.segments.map((seg) => (
                <tr key={seg.id}>
                  <td className="context-effectiveness-heatmap-sb91b02">
                    <div>
                      <Text as="div" size="xs" weight="semibold" color="primary">{seg.label}</Text>
                      <Text as="div" size="xs" color="tertiary">{seg.description}</Text>
                    </div>
                  </td>
                  {snapshot.models.map((model) => {
                    const cell = snapshot.cells.find(
                      (c) => c.segmentId === seg.id && c.modelId === model
                    ) ?? null;
                    const key = `${seg.id}::${model}`;
                    return (
                      <td className="context-effectiveness-heatmap-s677be1" key={model}>
                        <MatrixCell
                          cell={cell}
                          isSelected={selectedCellKey === key}
                          onClick={() => setSelectedCellKey(selectedCellKey === key ? null : key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Examples panel */}
        {selectedCell != null ? (
          <ExamplesPanel cell={selectedCell} segmentLabel={selectedSegmentLabel} />
        ) : (
          <div className="context-effectiveness-heatmap-s105cc1"
          >
            <Text as="div" size="xs" color="tertiary">
              Click a cell to see specific examples and token impact for that segment × model combination.
            </Text>
          </div>
        )}

        {/* Run count footer */}
        <Text as="div" size="xs" color="tertiary">
          {snapshot.scores.length} experiment score{snapshot.scores.length !== 1 ? 's' : ''} across {snapshot.models.length} model{snapshot.models.length !== 1 ? 's' : ''} and {snapshot.segments.length} segment{snapshot.segments.length !== 1 ? 's' : ''}
        </Text>
      </div>
    </ComponentWrapper>
  );
}

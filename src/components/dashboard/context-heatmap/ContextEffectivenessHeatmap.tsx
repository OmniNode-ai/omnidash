import { useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import { useContextHeatmap, KNOWN_SEGMENTS } from './useContextHeatmap';
import { classifyCell } from './context-heatmap.types';
import type { HeatmapCell, ContextHeatmapConfig, HeatmapSignal } from './context-heatmap.types';

// ── Color helpers ────────────────────────────────────────────────────────────

function signalBg(signal: HeatmapSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--color-ok, #22c55e) 20%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--color-bad, #ef4444) 20%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--color-warn, #f59e0b) 15%, transparent)';
    case 'unknown': return 'var(--panel-2)';
  }
}

function signalBorder(signal: HeatmapSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--color-ok, #22c55e) 40%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--color-bad, #ef4444) 40%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--color-warn, #f59e0b) 30%, transparent)';
    case 'unknown': return 'var(--line-2)';
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
      <div
        style={{
          width: 72,
          height: 52,
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          background: 'var(--panel-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
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
        border: `1px solid ${isSelected ? 'var(--brand)' : signalBorder(signal)}`,
        borderRadius: 6,
        background: isSelected ? 'var(--panel-2)' : signalBg(signal),
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        outline: isSelected ? '2px solid var(--brand)' : 'none',
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
      ? `saved ${Math.round(cell.tokenDelta).toLocaleString()} tokens avg`
      : cell.tokenDelta < 0
      ? `added ${Math.round(-cell.tokenDelta).toLocaleString()} tokens avg`
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
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

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Text as="div" size="xs" color="tertiary">Pass rate</Text>
          <Text as="div" size="xs" color="secondary">
            {cell.passCount}/{cell.totalCount} ({Math.round(cell.passRate * 100)}%)
          </Text>
        </div>
        <div>
          <Text as="div" size="xs" color="tertiary">Avg tokens</Text>
          <Text as="div" size="xs" color="secondary">
            {avgTokens.toLocaleString()}
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
              {cell.tokenDelta > 0 ? '−' : '+'}{Math.abs(Math.round(cell.tokenDelta)).toLocaleString()}
            </Text>
          </div>
        )}
      </div>

      {exampleLines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map(({ signal, label, detail }) => (
        <div key={signal} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
  const dataSourceMode = useDataSourceMode();
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);

  const selectedCell = selectedCellKey != null
    ? (snapshot.cells.find((c) => `${c.segmentId}::${c.modelId}` === selectedCellKey) ?? null)
    : null;

  const selectedSegmentLabel = selectedCell != null
    ? (KNOWN_SEGMENTS.find((s) => s.id === selectedCell.segmentId)?.label ?? selectedCell.segmentId)
    : '';

  const isInitialLoading = snapshot.isLoading && !snapshot.hasAnyData;

  return (
    <ComponentWrapper
      title="Context Effectiveness"
      isLoading={isInitialLoading}
      error={snapshot.error}
      isEmpty={!snapshot.isLoading && !snapshot.hasAnyData}
      emptyMessage="No experiment scores"
      emptyHint="context_experiment_scores requires the A3 delegation-verify-worker projection (OMN-12082)."
      isLive={isLiveDataSource(dataSourceMode)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Fixture badge */}
        {snapshot.isFixture && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--color-warn, #f59e0b) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warn, #f59e0b) 30%, transparent)',
              alignSelf: 'flex-start',
            }}
          >
            <Text as="span" size="xs" color="warn">
              Showing OMN-11241 research fixture — no live data yet
            </Text>
          </div>
        )}

        {/* Legend */}
        <Legend />

        {/* Matrix */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', minWidth: 140 }}>
                  <Text as="span" size="xs" color="tertiary">Segment</Text>
                </th>
                {snapshot.models.map((model) => (
                  <th key={model} style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <Text as="span" size="xs" color="secondary">{model}</Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KNOWN_SEGMENTS.filter((seg) =>
                snapshot.cells.some((c) => c.segmentId === seg.id)
              ).map((seg) => (
                <tr key={seg.id}>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
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
                      <td key={model} style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
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
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--line-2)',
              background: 'var(--panel-1)',
            }}
          >
            <Text as="div" size="xs" color="tertiary">
              Click a cell to see specific examples and token impact for that segment × model combination.
            </Text>
          </div>
        )}

        {/* Run count footer */}
        <Text as="div" size="xs" color="tertiary">
          {snapshot.scores.length} experiment score{snapshot.scores.length !== 1 ? 's' : ''} across {snapshot.models.length} model{snapshot.models.length !== 1 ? 's' : ''} and {KNOWN_SEGMENTS.filter((s) => snapshot.cells.some((c) => c.segmentId === s.id)).length} segment{KNOWN_SEGMENTS.filter((s) => snapshot.cells.some((c) => c.segmentId === s.id)).length !== 1 ? 's' : ''}
        </Text>
      </div>
    </ComponentWrapper>
  );
}

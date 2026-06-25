import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import {
  CONTEXT_MODES,
  CONTEXT_MODE_LABELS,
  classifyPassRate,
} from './instruction-eval.types';
import type {
  EvalResult,
  EvalContextMode,
  EvalSignal,
  InstructionEvalConfig,
} from './instruction-eval.types';

// ── Color helpers (shared vocabulary with ContextEffectivenessHeatmap) ─────────

function signalBg(signal: EvalSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--color-ok, #22c55e) 22%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--color-bad, #ef4444) 22%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--color-warn, #f59e0b) 18%, transparent)';
    case 'unknown': return 'var(--panel-2)';
  }
}

function signalBorder(signal: EvalSignal): string {
  switch (signal) {
    case 'helpful': return 'color-mix(in srgb, var(--color-ok, #22c55e) 42%, transparent)';
    case 'harmful': return 'color-mix(in srgb, var(--color-bad, #ef4444) 42%, transparent)';
    case 'neutral': return 'color-mix(in srgb, var(--color-warn, #f59e0b) 32%, transparent)';
    case 'unknown': return 'var(--line-2)';
  }
}

function signalTextColor(signal: EvalSignal): 'ok' | 'bad' | 'warn' | 'tertiary' {
  switch (signal) {
    case 'helpful': return 'ok';
    case 'harmful': return 'bad';
    case 'neutral': return 'warn';
    case 'unknown': return 'tertiary';
  }
}

// ── Derived matrix shape ───────────────────────────────────────────────────────

interface EvalMatrix {
  models: string[];
  tasks: string[];
  /** lookup key `${model}::${task}::${mode}` → result */
  byCell: Map<string, EvalResult>;
}

function buildMatrix(rows: EvalResult[]): EvalMatrix {
  const models: string[] = [];
  const tasks: string[] = [];
  const byCell = new Map<string, EvalResult>();
  for (const r of rows) {
    if (!models.includes(r.model)) models.push(r.model);
    if (!tasks.includes(r.task)) tasks.push(r.task);
    byCell.set(`${r.model}::${r.task}::${r.context_mode}`, r);
  }
  models.sort();
  tasks.sort();
  return { models, tasks, byCell };
}

function fmtTask(task: string): string {
  return task.replace(/-/g, ' ');
}

// ── Cells ──────────────────────────────────────────────────────────────────────

const CELL_W = 64;

function PassRateCell({ result }: { result: EvalResult | undefined }) {
  if (result == null) {
    return (
      <td style={cellTd}>
        <div style={{ ...cellBox, border: '1px solid var(--line-2)', background: 'var(--panel-1)' }}>
          <Text as="span" size="xs" color="tertiary">—</Text>
        </div>
      </td>
    );
  }
  // pass_rate may be null (absent data from projection) — render em-dash, never fake 0%
  if (result.pass_rate == null) {
    return (
      <td style={cellTd}>
        <div style={{ ...cellBox, border: '1px solid var(--line-2)', background: 'var(--panel-1)' }}>
          <Text as="span" size="xs" color="tertiary">—</Text>
        </div>
      </td>
    );
  }
  const signal = classifyPassRate(result.pass_rate);
  const pct = Math.round(result.pass_rate * 100);
  return (
    <td style={cellTd}>
      <div
        title={`${result.model} · ${fmtTask(result.task)} · ${CONTEXT_MODE_LABELS[result.context_mode]}\n${pct}% pass · ${Math.round(result.output_tokens).toLocaleString()} out tokens · ${result.runs} runs`}
        style={{
          ...cellBox,
          border: `1px solid ${signalBorder(signal)}`,
          background: signalBg(signal),
        }}
      >
        <Text as="span" size="xs" weight="semibold" color={signalTextColor(signal)}>
          {pct}%
        </Text>
        <Text as="span" size="xs" color="tertiary">
          {Math.round(result.output_tokens).toLocaleString()}t
        </Text>
      </div>
    </td>
  );
}

/**
 * Dilution = full-claude-md pass rate − chunk pass rate, averaged across models for one task.
 * Negative ⇒ the full CLAUDE.md diluted the targeted chunk's gain. `delta` null ⇒ no data.
 */
function DilutionCell({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <td colSpan={3} style={cellTd}>
        <div style={{ ...dilutionBox, border: '1px solid var(--line-2)', background: 'var(--panel-1)' }}>
          <Text as="span" size="xs" color="tertiary">—</Text>
        </div>
      </td>
    );
  }
  const pts = Math.round(delta * 100);
  const color: 'bad' | 'ok' | 'tertiary' = pts < 0 ? 'bad' : pts > 0 ? 'ok' : 'tertiary';
  const bg = pts < 0 ? signalBg('harmful') : pts > 0 ? signalBg('helpful') : 'var(--panel-1)';
  const border = pts < 0 ? signalBorder('harmful') : pts > 0 ? signalBorder('helpful') : 'var(--line-2)';
  return (
    <td colSpan={3} style={cellTd}>
      <div style={{ ...dilutionBox, border: `1px solid ${border}`, background: bg }}>
        <Text as="span" size="xs" weight="semibold" color={color}>
          {pts > 0 ? '+' : ''}{pts} pts
        </Text>
      </div>
    </td>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items: Array<{ signal: EvalSignal; label: string; detail: string }> = [
    { signal: 'helpful', label: 'Pass', detail: '≥75%' },
    { signal: 'neutral', label: 'Mixed', detail: '26–74%' },
    { signal: 'harmful', label: 'Fail', detail: '≤25%' },
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map(({ signal, label, detail }) => (
        <div key={signal} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 12, height: 12, borderRadius: 3,
              background: signalBg(signal),
              border: `1px solid ${signalBorder(signal)}`,
              flexShrink: 0,
            }}
          />
          <Text as="span" size="xs" color="secondary">{label}</Text>
          <Text as="span" size="xs" color="tertiary">({detail} pass rate)</Text>
        </div>
      ))}
    </div>
  );
}

// ── Empty / loading states ─────────────────────────────────────────────────────

function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <Text as="div" size="sm" color="tertiary">Loading projection data…</Text>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-label="No instruction-eval data. Rows appear once the instruction-eval runner emits results."
      style={{ padding: '24px 0', textAlign: 'center' }}
    >
      <Text as="div" size="sm" color="tertiary">
        No instruction-eval data yet. Rows appear once the instruction-eval runner emits results.
      </Text>
    </div>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────

export default function InstructionEvalHeatmap({ config: _config = {} }: { config?: InstructionEvalConfig }) {
  // Reads the contract-declared projection node_projection_instruction_eval exposes
  // at /projection/{topic}. No fixture, no fake rows: the panel renders an honest
  // empty/loading state until the instruction-eval runner emits aggregate events,
  // and an em-dash for any cell whose pass_rate is absent (NULL from the projection).
  const { data: rawRows, isLoading } = useProjectionQuery<EvalResult>({
    queryKey: ['instruction-eval-aggregate'],
    topic: TOPICS.instructionEvalAggregate,
  });

  const { models, tasks, byCell } = useMemo(() => buildMatrix(rawRows ?? []), [rawRows]);
  const totalRuns = useMemo(
    () => (rawRows ?? []).reduce((sum, r) => sum + r.runs, 0),
    [rawRows],
  );

  const hasRows = (rawRows ?? []).length > 0;

  return (
    <ComponentWrapper
      title="Instruction Eval — Context Dilution"
      isLive={hasRows}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!hasRows ? (
          <EmptyState isLoading={isLoading} />
        ) : (
          <>
            <Text as="div" size="xs" color="tertiary">
              Pass rate per model × task across three context modes. Each cell shows mean pass rate and
              mean output tokens. The dilution row is the full-CLAUDE.md minus chunk delta — negative means
              the full file diluted the targeted chunk&apos;s gain.
            </Text>

            <Legend />

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
                <thead>
                  <tr>
                    <th style={{ ...headTh, textAlign: 'left', minWidth: 88, position: 'sticky', left: 0, background: 'var(--panel-0, transparent)' }}>
                      <Text as="span" size="xs" color="tertiary">Model</Text>
                    </th>
                    {tasks.map((task) => (
                      <th key={task} colSpan={3} style={{ ...headTh, textAlign: 'center', borderBottom: '1px solid var(--line-2)' }}>
                        <Text as="span" size="xs" weight="semibold" color="primary">{fmtTask(task)}</Text>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...headTh, position: 'sticky', left: 0, background: 'var(--panel-0, transparent)' }} />
                    {tasks.flatMap((task) =>
                      CONTEXT_MODES.map((mode) => (
                        <th key={`${task}::${mode}`} style={{ ...headTh, textAlign: 'center', width: CELL_W }}>
                          <Text as="span" size="xs" color="secondary">
                            {mode === 'baseline' ? 'base' : mode === 'chunk' ? 'chunk' : 'full'}
                          </Text>
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model}>
                      <td style={{ ...headTh, verticalAlign: 'middle', position: 'sticky', left: 0, background: 'var(--panel-0, transparent)' }}>
                        <Text as="span" size="xs" weight="semibold" color="primary">{model}</Text>
                      </td>
                      {tasks.flatMap((task) =>
                        CONTEXT_MODES.map((mode: EvalContextMode) => (
                          <PassRateCell key={`${model}::${task}::${mode}`} result={byCell.get(`${model}::${task}::${mode}`)} />
                        )),
                      )}
                    </tr>
                  ))}

                  {/* Dilution row: one merged cell per task = mean(full − chunk) across all models */}
                  <tr>
                    <td style={{ ...headTh, verticalAlign: 'middle', position: 'sticky', left: 0, background: 'var(--panel-0, transparent)' }}>
                      <Text as="span" size="xs" weight="semibold" color="tertiary">dilution</Text>
                      <Text as="div" size="xs" color="tertiary">full − chunk</Text>
                    </td>
                    {tasks.map((task) => {
                      // Average the per-model deltas so the row reads as one number per task.
                      const deltas: number[] = [];
                      for (const model of models) {
                        const chunk = byCell.get(`${model}::${task}::chunk`);
                        const full = byCell.get(`${model}::${task}::full-claude-md`);
                        if (chunk?.pass_rate != null && full?.pass_rate != null) {
                          deltas.push(full.pass_rate - chunk.pass_rate);
                        }
                      }
                      const meanDelta = deltas.length > 0
                        ? deltas.reduce((a, b) => a + b, 0) / deltas.length
                        : null;
                      return <DilutionCell key={task} delta={meanDelta} />;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <Text as="div" size="xs" color="tertiary">
              {(rawRows ?? []).length} aggregated cells · {totalRuns.toLocaleString()} eval runs ·
              {' '}{models.length} models × {tasks.length} tasks × {CONTEXT_MODES.length} context modes
            </Text>
          </>
        )}
      </div>
    </ComponentWrapper>
  );
}

// ── Inline style fragments ──────────────────────────────────────────────────────

const headTh: React.CSSProperties = { padding: '4px 6px' };
const cellTd: React.CSSProperties = { padding: '3px 3px', textAlign: 'center', verticalAlign: 'middle' };
const cellBox: React.CSSProperties = {
  width: CELL_W,
  height: 46,
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  margin: '0 auto',
};
const dilutionBox: React.CSSProperties = {
  height: 30,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

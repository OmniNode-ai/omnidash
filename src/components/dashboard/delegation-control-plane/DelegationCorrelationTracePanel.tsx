import { useEffect, useState } from 'react';
import { Text } from '@/components/ui/typography';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import { useDelegationRunContext } from './DelegationRunContext';
import { fetchCorrelationTrace, type CorrelationTraceEvent } from '@/services/delegation-api';
import { fmtDate, fmtMs, fmtTokens, fmtUsd } from './format';

function fmtBool(value: boolean | null | undefined): { label: string; color: 'ok' | 'bad' | 'tertiary' } {
  if (value === true) return { label: 'passed', color: 'ok' };
  if (value === false) return { label: 'failed', color: 'bad' };
  return { label: 'unknown', color: 'tertiary' };
}

function latencyBetween(prev: CorrelationTraceEvent | undefined, curr: CorrelationTraceEvent): string {
  if (!prev) return '';
  const t0 = Date.parse(prev.created_at ?? '') || 0;
  const t1 = Date.parse(curr.created_at ?? '') || 0;
  const delta = t1 - t0;
  if (delta <= 0 || t0 === 0 || t1 === 0) return '';
  return `+${fmtMs(delta)}`;
}

function EventRow({ event, prev, index }: { event: CorrelationTraceEvent; prev: CorrelationTraceEvent | undefined; index: number }) {
  const gate = fmtBool(event.quality_gate_passed);
  const delta = latencyBetween(prev, event);
  const tokens = (event.tokens_input ?? 0) + (event.tokens_output ?? 0);
  const tokenLabel = tokens > 0 ? fmtTokens(tokens) : '-';
  const costLabel = event.cost_usd != null ? fmtUsd(event.cost_usd) : '-';
  const savingsLabel = event.cost_savings_usd != null ? fmtUsd(event.cost_savings_usd) : '-';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr',
        gap: 8,
        paddingBottom: 12,
        borderBottom: '1px solid var(--line-2)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: event.quality_gate_passed === true
              ? 'var(--color-ok, #22c55e)'
              : event.quality_gate_passed === false
              ? 'var(--color-error, #ef4444)'
              : 'var(--text-tertiary, #888)',
            flexShrink: 0,
            marginTop: 4,
          }}
        />
        {delta && (
          <Text as="span" size="xs" family="mono" color="tertiary" style={{ writingMode: 'horizontal-tb' }}>
            {delta}
          </Text>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Text as="span" size="xs" family="mono" color="secondary">
            {index + 1}. {event.task_type ?? 'unknown'} → {event.model_name ?? event.delegated_to ?? 'unknown'}
          </Text>
          <Text as="span" size="xs" family="mono" color="tertiary">
            {fmtDate(event.created_at ?? undefined)}
          </Text>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <LabeledValue label="gate" value={gate.label} valueColor={gate.color} />
          <LabeledValue label="latency" value={event.delegation_latency_ms != null ? fmtMs(event.delegation_latency_ms) : '-'} />
          <LabeledValue label="tokens" value={tokenLabel} />
          <LabeledValue label="cost" value={costLabel} />
          <LabeledValue label="savings" value={savingsLabel} />
          {event.routing_rule && (
            <LabeledValue label="rule" value={event.routing_rule} />
          )}
          {event.routing_confidence != null && (
            <LabeledValue label="conf" value={`${Math.round(event.routing_confidence * 100)}%`} />
          )}
        </div>

        {(event.quality_gates_checked != null || event.quality_gates_failed != null) && (
          <Text as="span" size="xs" color="secondary">
            Quality gates: {event.quality_gates_checked ?? 0} checked, {event.quality_gates_failed ?? 0} failed
          </Text>
        )}

        {event.session_id && (
          <Text as="span" size="xs" family="mono" color="tertiary">
            session {event.session_id}
          </Text>
        )}
      </div>
    </div>
  );
}

function LabeledValue({
  label,
  value,
  valueColor = 'secondary',
}: {
  label: string;
  value: string;
  valueColor?: 'ok' | 'bad' | 'secondary' | 'tertiary';
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Text as="span" size="xs" color="tertiary">{label}</Text>
      <Text as="span" size="xs" family="mono" color={valueColor}>{value}</Text>
    </div>
  );
}

export function DelegationCorrelationTracePanel() {
  const { selectedRun } = useDelegationRunContext();
  const correlationId = selectedRun?.correlationId ?? null;

  const [rows, setRows] = useState<CorrelationTraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!correlationId) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCorrelationTrace(correlationId)
      .then((result) => {
        if (!cancelled) setRows(result.rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [correlationId]);

  if (!correlationId) {
    return (
      <DelegationPanelFrame
        title="Correlation Trace"
        subtitle="Select a run from the table above to see its full event chain."
      >
        <Text as="div" size="sm" color="tertiary">No run selected.</Text>
      </DelegationPanelFrame>
    );
  }

  return (
    <DelegationPanelFrame
      title="Correlation Trace"
      subtitle={`Full event chain for correlation ${correlationId}. Ordered by created_at ascending. Source: delegation_events table.`}
    >
      <Text as="div" size="xs" family="mono" color="tertiary" style={{ marginBottom: 10, overflowWrap: 'break-word' }}>
        {correlationId}
      </Text>

      {loading && (
        <Text as="div" size="sm" color="tertiary">Loading trace…</Text>
      )}

      {error && (
        <Text as="div" size="sm" color="bad">
          Error: {error}. Correlation trace requires postgres data source.
        </Text>
      )}

      {!loading && !error && rows.length === 0 && (
        <Text as="div" size="sm" color="tertiary">
          No events found for this correlation ID. The projection row may have been created from a routing trace
          rather than a direct delegation_events row.
        </Text>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
            <Text as="span" size="xs" color="tertiary">{rows.length} event{rows.length !== 1 ? 's' : ''}</Text>
            {rows.length > 1 && (
              <Text as="span" size="xs" family="mono" color="tertiary">
                span: {(() => {
                  const t0 = Date.parse(rows[0].created_at ?? '') || 0;
                  const t1 = Date.parse(rows[rows.length - 1].created_at ?? '') || 0;
                  return t0 > 0 && t1 > 0 ? fmtMs(t1 - t0) : '-';
                })()}
              </Text>
            )}
          </div>
          {rows.map((event, idx) => (
            <EventRow key={String(event.id)} event={event} prev={rows[idx - 1]} index={idx} />
          ))}
        </div>
      )}
    </DelegationPanelFrame>
  );
}

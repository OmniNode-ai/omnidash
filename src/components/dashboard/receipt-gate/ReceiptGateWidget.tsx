/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { CardHeader } from '@/components/primitives';
import { useProjectionQueryWithContract } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';

// ── Projection row shape ─────────────────────────────────────────────

interface ReceiptGateRow {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
  pr_ref?: string;
  worker?: string;
  verifier?: string;
  evidence_count?: number;
  evidence_hash?: string;
  signed_at?: string;
}

// ── Minimal visualization contract for receipt-gate ──────────────────

const RECEIPT_GATE_CONTRACT = {
  version: '1.0.0',
  topic: TOPICS.receiptGate,
  display_name: 'Receipt Gate',
  default_visualization: 'table' as const,
  available_visualizations: ['table' as const],
  controls: [],
  cost_field: '',
  latency_field: '',
  display_name_field: 'name',
  group_by: '',
} satisfies import('../../../../shared/types/visualization-contract').VisualizationContract;

// ── Sub-components ────────────────────────────────────────────────────

function CheckMark({ pass }: { pass: boolean }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        background: pass ? 'var(--good)' : 'var(--bad)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        {pass ? (
          <path d="M2,5 L4.5,7.5 L8.5,3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3,3 L7,7 M7,3 L3,7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

function Stamp({ pass }: { pass: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: pass ? 'var(--good)' : 'var(--ink-3)',
        boxShadow: pass ? '0 0 0 3px var(--good-soft)' : 'none',
        display: 'inline-block',
      }}
    />
  );
}

function StaleBanner({ freshness }: { freshness: string | null }) {
  return (
    <Text as="div" size="sm" color="bad" style={{ marginBottom: 8 }}>
      Data may be stale{freshness ? ` (last snapshot: ${freshness})` : ''}.
    </Text>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export default function ReceiptGateWidget() {
  const { data, is_degraded, freshness, isLoading, error } = useProjectionQueryWithContract<ReceiptGateRow>({
    topic: TOPICS.receiptGate,
    contract: RECEIPT_GATE_CONTRACT,
    refetchInterval: 30_000,
  });

  const gates = useMemo(() => data, [data]);
  const passed = useMemo(() => gates.filter((g) => g.pass).length, [gates]);
  const total = gates.length;
  const allPass = total > 0 && passed === total;
  const isEmpty = total === 0 && !isLoading;

  // Use first row for manifest fields (all rows share the same receipt context).
  const manifest = gates[0] ?? null;

  return (
    <ComponentWrapper
      title="Receipt Gate"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No receipt gate data"
      emptyHint="Receipt gate data appears after verification receipts are produced"
    >
      <div style={{ width: '100%' }}>
        {is_degraded && <StaleBanner freshness={freshness} />}

        <CardHeader
          eyebrow={`Receipt gate${manifest?.pr_ref ? ` · ${manifest.pr_ref}` : ''}`}
          title={allPass ? 'Independent verifier signed.' : 'Verification in progress.'}
          right={
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 6,
                background: allPass ? 'var(--good-soft)' : 'var(--bg-sunken)',
                color: allPass ? 'var(--good)' : 'var(--ink-3)',
                "fontSize": 11,
                "fontWeight": 700,
                "letterSpacing": '0.12em',
              }}
            >
              <Stamp pass={allPass} />
              {allPass ? 'MERGED' : 'VERIFYING…'}
            </div>
          }
        />

        {/* Progress meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="mono tnum" style={{ "fontSize": 28, "fontWeight": 800, color: 'var(--good)' }}>
            {passed}
            <span style={{ "color": 'var(--ink-3)', "fontSize": 18, "fontWeight": 600 }}>/{total}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: 'var(--good)' }}>gates passed</div>
            <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: total > 0 ? `${(passed / total) * 100}%` : '0%', height: '100%', background: 'var(--good)', transition: 'width .25s' }} />
            </div>
          </div>
        </div>

        {/* Gates list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {gates.map((g, i) => (
            <div
              key={g.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: i < gates.length - 1 ? '1px dashed var(--line-2)' : 'none',
              }}
            >
              <CheckMark pass={g.pass} />
              <div style={{ minWidth: 0 }}>
                <div style={{ "fontSize": 13, "fontWeight": 600, "color": 'var(--ink)' }}>{g.name}</div>
                <div
                  className="mono"
                  style={{
                    "fontSize": 10,
                    "color": 'var(--ink-3)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g.detail}
                </div>
              </div>
              <div
                className="mono"
                style={{ "fontSize": 9, "color": 'var(--ink-4)', "letterSpacing": '0.16em', "fontWeight": 700 }}
              >
                g.{String(i + 1).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>

        {/* Receipt manifest — only shown when projection supplies manifest fields */}
        {manifest && (manifest.worker || manifest.verifier || manifest.evidence_count || manifest.signed_at) && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'var(--bg-sunken)',
              borderRadius: 6,
              "fontSize": 11,
              "color": 'var(--ink-2)',
              "lineHeight": 1.6,
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>receipt manifest</div>
            <div className="mono">
              {manifest.worker && (
                <>worker: <span style={{ color: 'var(--compute-ink)' }}>{manifest.worker}</span><br /></>
              )}
              {manifest.verifier && (
                <>verifier: <span style={{ color: 'var(--reducer-ink)' }}>{manifest.verifier}</span><br /></>
              )}
              {manifest.evidence_count !== undefined && (
                <>
                  evidence: <span style={{ "color": 'var(--ink)' }}>
                    {manifest.evidence_count} artifact{manifest.evidence_count !== 1 ? 's' : ''}
                    {manifest.evidence_hash ? ` · sha256:${manifest.evidence_hash}` : ''}
                  </span><br />
                </>
              )}
              {manifest.signed_at && (
                <>signed: <span style={{ "color": 'var(--ink)' }}>{manifest.signed_at}</span></>
              )}
            </div>
          </div>
        )}
      </div>
    </ComponentWrapper>
  );
}

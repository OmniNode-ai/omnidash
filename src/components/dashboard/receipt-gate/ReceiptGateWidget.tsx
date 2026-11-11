/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { CardHeader } from '@/components/primitives';
import { useProjectionQueryWithContract } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in ReceiptGateWidget.static.css.
import './ReceiptGateWidget.static.css';

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
        background: pass ? 'var(--ds-ok)' : 'var(--ds-bad)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        {pass ? (
          <path d="M2,5 L4.5,7.5 L8.5,3" stroke="var(--ds-on-accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3,3 L7,7 M7,3 L3,7" stroke="var(--ds-on-accent)" strokeWidth="1.6" strokeLinecap="round" />
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
        background: pass ? 'var(--ds-ok)' : 'var(--ds-ink-3)',
        boxShadow: pass ? '0 0 0 3px var(--ds-ok-soft)' : 'none',
        display: 'inline-block',
      }}
    />
  );
}

function StaleBanner({ freshness }: { freshness: string | null }) {
  return (
    <Text className="receipt-gate-widget-s7f3cba" as="div" size="sm" color="bad">
      Data may be stale{freshness ? ` (last snapshot: ${freshness})` : ''}.
    </Text>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export default function ReceiptGateWidget() {
  const { data, is_degraded, freshness, isLoading, error } = useProjectionQueryWithContract<ReceiptGateRow>({
    topic: TOPICS.receiptGate,
    contract: RECEIPT_GATE_CONTRACT,
    refetchInterval: refreshInterval(),
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
      <div className="receipt-gate-widget-s69d66e">
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
                background: allPass ? 'var(--ds-ok-soft)' : 'var(--ds-inset)',
                color: allPass ? 'var(--ds-ok)' : 'var(--ds-ink-3)',
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
        <div className="receipt-gate-widget-s7f1517">
          <div className="mono tnum receipt-gate-widget-s809d79">
            {passed}
            <span className="receipt-gate-widget-s0a60c7">/{total}</span>
          </div>
          <div className="receipt-gate-widget-see3d55">
            <div className="eyebrow receipt-gate-widget-s231281">gates passed</div>
            <div className="receipt-gate-widget-sf413dd">
              <div style={{ width: total > 0 ? `${(passed / total) * 100}%` : '0%', height: '100%', background: 'var(--ds-ok)', transition: 'width .25s' }} />
            </div>
          </div>
        </div>

        {/* Gates list */}
        <div className="receipt-gate-widget-s30160b">
          {gates.map((g, i) => (
            <div
              key={g.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: i < gates.length - 1 ? '1px dashed var(--ds-line-soft)' : 'none',
              }}
            >
              <CheckMark pass={g.pass} />
              <div className="receipt-gate-widget-s2cd52a">
                <div className="receipt-gate-widget-s13bec8">{g.name}</div>
                <div
                  className="mono receipt-gate-widget-s5a3509"
                >
                  {g.detail}
                </div>
              </div>
              <div
                className="mono receipt-gate-widget-s181847"
              >
                g.{String(i + 1).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>

        {/* Receipt manifest — only shown when projection supplies manifest fields */}
        {manifest && (manifest.worker || manifest.verifier || manifest.evidence_count || manifest.signed_at) && (
          <div className="receipt-gate-widget-sbd0ffe"
          >
            <div className="eyebrow receipt-gate-widget-s4feedf">receipt manifest</div>
            <div className="mono">
              {manifest.worker && (
                <>worker: <span className="receipt-gate-widget-s7331b6">{manifest.worker}</span><br /></>
              )}
              {manifest.verifier && (
                <>verifier: <span className="receipt-gate-widget-sc0c872">{manifest.verifier}</span><br /></>
              )}
              {manifest.evidence_count !== undefined && (
                <>
                  evidence: <span className="receipt-gate-widget-s3227ff">
                    {manifest.evidence_count} artifact{manifest.evidence_count !== 1 ? 's' : ''}
                    {manifest.evidence_hash ? ` · sha256:${manifest.evidence_hash}` : ''}
                  </span><br />
                </>
              )}
              {manifest.signed_at && (
                <>signed: <span className="receipt-gate-widget-s3227ff">{manifest.signed_at}</span></>
              )}
            </div>
          </div>
        )}
      </div>
    </ComponentWrapper>
  );
}

import { useCallback, useEffect } from 'react';
import { Text } from '@/components/ui/typography';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import { useDelegationRunContext } from './DelegationRunContext';
import { fmtDate, fmtMs, fmtTokens, fmtUsd } from './format';
import type { DelegationRun } from './delegation-control-plane.types';

// Print stylesheet injected into document head while this panel is mounted.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #proof-pack-printable,
  #proof-pack-printable * { visibility: visible !important; }
  #proof-pack-printable {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    background: white !important;
    color: black !important;
    font-family: monospace !important;
    font-size: 10pt !important;
    padding: 20px !important;
    z-index: 9999 !important;
  }
  .proof-pack-no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100% !important; }
  th, td { border: 1px solid #ccc !important; padding: 4px 6px !important; font-size: 8pt !important; }
  th { background: #f0f0f0 !important; }
  .proof-gate-passed { color: #166534 !important; }
  .proof-gate-failed { color: #991b1b !important; }
}
`;

function useProofPackPrintStyle() {
  useEffect(() => {
    const existing = document.getElementById('proof-pack-print');
    if (existing) return;
    const el = document.createElement('style');
    el.id = 'proof-pack-print';
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);
}

function gateClass(status: DelegationRun['status']): string {
  if (status === 'passed') return 'proof-gate-passed';
  if (status === 'failed') return 'proof-gate-failed';
  return '';
}

function gateLabel(status: DelegationRun['status']): string {
  if (status === 'passed') return 'PASSED';
  if (status === 'failed') return 'FAILED';
  return 'projected';
}

export function DelegationSavingsProofPackPanel() {
  useProofPackPrintStyle();
  const { snapshot } = useDelegationRunContext();
  const { runs, savings } = snapshot;

  const cumulativeSavings = savings?.cumulative_savings_usd ?? 0;
  const cumulativeCloudCost = savings?.cumulative_cloud_cost_usd ?? 0;
  const pricingManifest = savings?.pricing_manifest_version ?? 'pending';
  const capturedAt = savings?.captured_at;

  const handlePrint = useCallback(() => { window.print(); }, []);

  const generatedAt = new Date().toISOString();

  if (runs.length === 0) {
    return (
      <DelegationPanelFrame
        title="Savings Proof Pack"
        subtitle="Exportable audit artifact for procurement review. Requires at least one delegation run."
      >
        <Text as="div" size="sm" color="tertiary">
          No delegation runs available. Run a delegation first or ensure the projection data source is connected.
        </Text>
      </DelegationPanelFrame>
    );
  }

  return (
    <DelegationPanelFrame
      title="Savings Proof Pack"
      subtitle="Exportable audit artifact. Print this page or Save as PDF to share with procurement."
    >
      <div className="proof-pack-no-print" style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid var(--line)',
            borderRadius: 6,
            padding: '6px 14px',
            background: 'var(--panel-3)',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <Text as="span" size="sm" weight="semibold" color="primary">Print / Save as PDF</Text>
        </button>
        <Text as="span" size="xs" color="tertiary" style={{ marginLeft: 12 }}>
          Use browser Print → Save as PDF to export a shareable artifact.
        </Text>
      </div>

      <div id="proof-pack-printable">
        <ProofPackHeader
          generatedAt={generatedAt}
          capturedAt={capturedAt}
          pricingManifest={pricingManifest}
          runCount={runs.length}
          cumulativeSavings={cumulativeSavings}
          cumulativeCloudCost={cumulativeCloudCost}
        />
        <RunTable runs={runs} />
      </div>
    </DelegationPanelFrame>
  );
}

function ProofPackHeader({
  generatedAt,
  capturedAt,
  pricingManifest,
  runCount,
  cumulativeSavings,
  cumulativeCloudCost,
}: {
  generatedAt: string;
  capturedAt: string | undefined;
  pricingManifest: string;
  runCount: number;
  cumulativeSavings: number;
  cumulativeCloudCost: number;
}) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
      <Text as="div" size="lg" weight="semibold" color="primary" style={{ marginBottom: 6 }}>
        OmniNode Delegation Savings Report
      </Text>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
        <ProofFact label="Generated" value={fmtDate(generatedAt)} />
        <ProofFact label="Data captured" value={fmtDate(capturedAt)} />
        <ProofFact label="Pricing manifest" value={pricingManifest} />
        <ProofFact label="Total runs" value={String(runCount)} />
        <ProofFact label="Cumulative savings" value={fmtUsd(cumulativeSavings)} highlight />
        <ProofFact label="Est. cloud cost (baseline)" value={fmtUsd(cumulativeCloudCost)} />
      </div>
      <Text as="div" size="xs" color="tertiary">
        Source: OmniNode delegation_events projection. Savings calculated against baseline cloud model pricing per pricing manifest version above.
        This report is generated from live projection data and is reproducible by re-querying the same projection endpoints.
      </Text>
    </div>
  );
}

function ProofFact({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="sm" family="mono" color={highlight ? 'ok' : 'primary'}>{value}</Text>
    </div>
  );
}

function RunTable({ runs }: { runs: DelegationRun[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Correlation ID', 'Task type', 'Model / Route', 'Quality gate', 'Routing rule', 'Latency', 'Tokens', 'Est. cost', 'Savings', 'Pricing manifest', 'Timestamp'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--line)',
                  background: 'var(--panel-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Text as="span" size="xs" weight="semibold" color="secondary">{h}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run, idx) => (
            <RunRow key={run.id} run={run} index={idx} />
          ))}
        </tbody>
        <tfoot>
          <TotalsRow runs={runs} />
        </tfoot>
      </table>
    </div>
  );
}

function RunRow({ run, index }: { run: DelegationRun; index: number }) {
  const cls = gateClass(run.status);
  return (
    <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="tertiary">{index + 1}</Text>
      </td>
      <td style={{ padding: '4px 8px', maxWidth: 160 }}>
        <Text as="span" size="xs" family="mono" color="secondary" title={run.correlationId}>
          {run.correlationId}
        </Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" color="secondary">{run.taskType}</Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{run.modelName}</Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color={run.status === 'passed' ? 'ok' : run.status === 'failed' ? 'bad' : 'tertiary'}>
          <span className={cls}>{gateLabel(run.status)}</span>
        </Text>
        {run.qualityGateDetail && (
          <Text as="div" size="xs" color="tertiary">{run.qualityGateDetail}</Text>
        )}
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="tertiary">{run.routingRule ?? '-'}</Text>
        {run.routingConfidence != null && (
          <Text as="div" size="xs" color="tertiary">{Math.round(run.routingConfidence * 100)}%</Text>
        )}
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{run.latencyMs != null ? fmtMs(run.latencyMs) : '-'}</Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{run.tokenCount != null ? fmtTokens(run.tokenCount) : '-'}</Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{run.estimatedCostUsd != null ? fmtUsd(run.estimatedCostUsd) : '-'}</Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color={run.savingsUsd != null && run.savingsUsd > 0 ? 'ok' : 'secondary'}>
          {run.savingsUsd != null ? fmtUsd(run.savingsUsd) : '-'}
        </Text>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <Text as="span" size="xs" family="mono" color="tertiary">{run.pricingManifestVersion ?? '-'}</Text>
      </td>
      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
        <Text as="span" size="xs" family="mono" color="tertiary">{fmtDate(run.createdAt)}</Text>
      </td>
    </tr>
  );
}

function TotalsRow({ runs }: { runs: DelegationRun[] }) {
  const totalSavings = runs.reduce((sum, r) => sum + (r.savingsUsd ?? 0), 0);
  const totalCost = runs.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);
  const totalTokens = runs.reduce((sum, r) => sum + (r.tokenCount ?? 0), 0);
  const passedCount = runs.filter((r) => r.status === 'passed').length;
  const passRate = runs.length > 0 ? `${Math.round((passedCount / runs.length) * 100)}%` : '-';

  return (
    <tr style={{ borderTop: '2px solid var(--line)', background: 'var(--panel-2)' }}>
      <td style={{ padding: '5px 8px' }} colSpan={4}>
        <Text as="span" size="xs" weight="semibold" color="primary">Totals ({runs.length} runs)</Text>
      </td>
      <td style={{ padding: '5px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{passRate} pass rate</Text>
      </td>
      <td style={{ padding: '5px 8px' }} />
      <td style={{ padding: '5px 8px' }} />
      <td style={{ padding: '5px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{totalTokens > 0 ? fmtTokens(totalTokens) : '-'}</Text>
      </td>
      <td style={{ padding: '5px 8px' }}>
        <Text as="span" size="xs" family="mono" color="secondary">{totalCost > 0 ? fmtUsd(totalCost) : '-'}</Text>
      </td>
      <td style={{ padding: '5px 8px' }}>
        <Text as="span" size="xs" family="mono" color={totalSavings > 0 ? 'ok' : 'secondary'}>
          {totalSavings > 0 ? fmtUsd(totalSavings) : '-'}
        </Text>
      </td>
      <td style={{ padding: '5px 8px' }} colSpan={2} />
    </tr>
  );
}

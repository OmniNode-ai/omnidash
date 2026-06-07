import { Text } from '@/components/ui/typography';
import { fmtDate, fmtUsd, shortId } from './format';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot, DelegationRun } from './delegation-control-plane.types';

export function DelegationEvidenceBundlePanel({
  snapshot,
  selectedRun,
}: {
  snapshot: DelegationEvidenceSnapshot;
  selectedRun: DelegationRun | null;
}) {
  const pricingVersion = selectedRun?.pricingManifestVersion ?? snapshot.savings?.pricing_manifest_version ?? 'pending';
  const captured = snapshot.probes.map((probe) => probe.capturedAt).filter(Boolean).sort().at(-1);

  return (
    <DelegationPanelFrame
      title="Evidence Bundle"
      authority="projection-backed"
      subtitle="Dashboard-side manifest of proof material available for the selected delegation run."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <BundleFact label="Correlation ID" value={shortId(selectedRun?.correlationId)} title={selectedRun?.correlationId} />
        <BundleFact label="Pricing manifest" value={pricingVersion} />
        <BundleFact label="Projected savings" value={fmtUsd(selectedRun?.savingsUsd ?? snapshot.savings?.cumulative_savings_usd)} />
        <BundleFact label="Captured at" value={fmtDate(captured)} />
        <BundleFact label="Artifact manifest" value="pending projection" />
        <BundleFact label="OCC receipt refs" value="pending evidence closeout" />
      </div>
      <Text as="div" size="xs" color="tertiary" style={{ marginTop: 12 }}>
        Final OMN-11623 proof still needs artifact hash rows and OCC receipt references; this panel reserves the dashboard contract surface for those fields.
      </Text>
    </DelegationPanelFrame>
  );
}

function BundleFact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="sm" family="mono" color="secondary" title={title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </Text>
    </div>
  );
}

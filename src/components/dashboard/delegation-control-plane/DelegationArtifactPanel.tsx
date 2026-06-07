import { Text } from '@/components/ui/typography';
import { fmtDate, fmtUsd, shortId } from './format';
import { DelegationPanelFrame, EmptyPanel } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot, DelegationRun } from './delegation-control-plane.types';

interface ArtifactRow {
  type: string;
  label: string;
  value: string;
  title?: string;
  available: boolean;
}

function buildArtifacts(snapshot: DelegationEvidenceSnapshot, selectedRun: DelegationRun | null): ArtifactRow[] {
  const pricingVersion = selectedRun?.pricingManifestVersion ?? snapshot.savings?.pricing_manifest_version;
  const capturedAt = snapshot.probes.map((p) => p.capturedAt).filter(Boolean).sort().at(-1);

  return [
    {
      type: 'OCC receipt',
      label: 'Delegation OCC receipt',
      value: selectedRun ? `occ:delegation:${shortId(selectedRun.correlationId)}` : 'awaiting run selection',
      title: selectedRun?.correlationId,
      available: Boolean(selectedRun),
    },
    {
      type: 'OCC receipt',
      label: 'Quality gate receipt',
      value: selectedRun?.status === 'passed' || selectedRun?.status === 'failed'
        ? `occ:quality-gate:${selectedRun.status}`
        : 'pending terminal event',
      available: Boolean(selectedRun?.status !== 'projected'),
    },
    {
      type: 'Manifest',
      label: 'Pricing manifest',
      value: pricingVersion ?? 'pending projection',
      available: Boolean(pricingVersion),
    },
    {
      type: 'Manifest',
      label: 'Projection manifest',
      value: capturedAt ? `snapshot:${fmtDate(capturedAt)}` : 'pending first projection',
      available: Boolean(capturedAt),
    },
    {
      type: 'Report',
      label: 'Savings report',
      value: snapshot.savings
        ? `sessions:${snapshot.savings.session_count} savings:${fmtUsd(snapshot.savings.cumulative_savings_usd)}`
        : 'pending savings projection',
      available: Boolean(snapshot.savings),
    },
    {
      type: 'Report',
      label: 'Quality gate report',
      value: snapshot.qualityGate
        ? `pass_rate:${Math.round((snapshot.qualityGate.overall_pass_rate ?? 0) * 100)}% checks:${snapshot.qualityGate.total_checks}`
        : 'pending quality projection',
      available: Boolean(snapshot.qualityGate),
    },
    {
      type: 'Hash',
      label: 'Contract hash',
      value: 'projection-pending',
      available: false,
    },
    {
      type: 'Screenshot',
      label: 'Dashboard screenshot',
      value: 'attach via PR dod_evidence',
      available: false,
    },
  ];
}

export function DelegationArtifactPanel({
  snapshot,
  selectedRun,
}: {
  snapshot: DelegationEvidenceSnapshot;
  selectedRun: DelegationRun | null;
}) {
  const artifacts = buildArtifacts(snapshot, selectedRun);
  const availableCount = artifacts.filter((a) => a.available).length;

  if (!snapshot.hasAnyData && !snapshot.isLoading) {
    return (
      <DelegationPanelFrame
        title="Artifacts"
        authority="projection-backed"
        subtitle="OCC receipts, report links, manifest files, screenshots, and hashes."
      >
        <EmptyPanel message="No projection data — run the market delegation golden chain to populate artifacts." />
      </DelegationPanelFrame>
    );
  }

  const byType = artifacts.reduce<Record<string, ArtifactRow[]>>((acc, row) => {
    if (!acc[row.type]) acc[row.type] = [];
    acc[row.type].push(row);
    return acc;
  }, {});

  return (
    <DelegationPanelFrame
      title="Artifacts"
      authority="projection-backed"
      subtitle="OCC receipts, report links, manifest files, screenshots, and hashes."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Text as="div" size="xs" color="tertiary">
          {availableCount} of {artifacts.length} artifact slots populated from current projection data.
        </Text>

        {Object.entries(byType).map(([type, rows]) => (
          <div key={type}>
            <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 6 }}>{type}s</Text>
            <div style={{ display: 'grid', gap: 6 }}>
              {rows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    gap: 10,
                    alignItems: 'start',
                    opacity: row.available ? 1 : 0.5,
                  }}
                >
                  <Text as="span" size="xs" color="tertiary" style={{ paddingTop: 1 }}>{row.label}</Text>
                  <Text
                    as="span"
                    size="xs"
                    family="mono"
                    color={row.available ? 'secondary' : 'tertiary'}
                    title={row.title}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {row.value}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Text as="div" size="xs" color="tertiary">
          Contract hash and screenshot slots require a completed delegation run with OCC receipt closeout. Attach screenshots to the PR dod_evidence for visual proof.
        </Text>
      </div>
    </DelegationPanelFrame>
  );
}

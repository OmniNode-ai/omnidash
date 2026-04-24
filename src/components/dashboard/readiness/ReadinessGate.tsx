import type { CSSProperties } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';

export type DimensionStatus = 'PASS' | 'WARN' | 'FAIL';

export interface ReadinessDimension {
  name: string;
  status: DimensionStatus;
  detail: string;
}

export interface ReadinessSummary {
  dimensions: ReadinessDimension[];
  overallStatus: DimensionStatus;
  lastCheckedAt: string;
}

const STATUS_COLORS: Record<DimensionStatus, string> = {
  PASS: 'var(--status-ok)',
  WARN: 'var(--status-warn)',
  FAIL: 'var(--status-bad)',
};

const STATUS_TEXT_COLOR: Record<DimensionStatus, 'ok' | 'warn' | 'bad'> = {
  PASS: 'ok',
  WARN: 'warn',
  FAIL: 'bad',
};

function StatusPill({ status }: { status: DimensionStatus }) {
  return (
    <Text
      size="xs"
      weight="bold"
      color={STATUS_TEXT_COLOR[status]}
      className="text-tracked"
      style={{
        display: 'inline-block',
        minWidth: 44,
        textAlign: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${STATUS_COLORS[status]}`,
      }}
    >
      {status}
    </Text>
  );
}

export default function ReadinessGate({ config: _config }: { config: Record<string, unknown> }) {
  const { data: dataArr, isLoading, error } = useProjectionQuery<ReadinessSummary>({
    topic: 'onex.snapshot.projection.overnight.v1',
    queryKey: ['readiness-summary'],
    refetchInterval: 120_000,
  });
  const data = dataArr?.[0];

  return (
    <ComponentWrapper
      title="Platform Readiness Gate"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!data}
      emptyMessage="No readiness data"
      emptyHint="Readiness dimensions appear after checks are registered"
    >
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Text size="md" color="secondary">Overall</Text>
            <StatusPill status={data.overallStatus} />
            <Text size="sm" color="tertiary" style={{ marginLeft: 'auto' }}>
              Checked {new Date(data.lastCheckedAt).toLocaleTimeString()}
            </Text>
          </div>

          <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                <col style={{ width: 72 }} />
                <col style={{ width: '40%' }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>
                    <Text size="sm" weight="semibold" color="secondary" transform="uppercase" className="text-tracked">Status</Text>
                  </th>
                  <th scope="col" style={thStyle}>
                    <Text size="sm" weight="semibold" color="secondary" transform="uppercase" className="text-tracked">Dimension</Text>
                  </th>
                  <th scope="col" style={thStyle}>
                    <Text size="sm" weight="semibold" color="secondary" transform="uppercase" className="text-tracked">Detail</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.dimensions.map((dim) => (
                  <tr key={dim.name} style={{ borderTop: '1px solid var(--line-2)' }}>
                    <td style={tdStyle}>
                      <StatusPill status={dim.status} />
                    </td>
                    <td style={tdStyle}>
                      <Text size="lg" weight="semibold" color="primary">{dim.name}</Text>
                    </td>
                    <td style={tdStyle}>
                      <Text size="lg" color="secondary">{dim.detail}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.375rem 0.625rem',
  background: 'var(--panel-2)',
  borderBottom: '1px solid var(--line)',
};

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.625rem',
  verticalAlign: 'middle',
};

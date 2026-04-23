import type { CSSProperties } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';

type DimensionStatus = 'PASS' | 'WARN' | 'FAIL';

interface ReadinessDimension {
  name: string;
  status: DimensionStatus;
  detail: string;
}

interface ReadinessSummary {
  dimensions: ReadinessDimension[];
  overallStatus: DimensionStatus;
  lastCheckedAt: string;
}

const STATUS_COLORS: Record<DimensionStatus, string> = {
  PASS: 'var(--status-ok)',
  WARN: 'var(--status-warn)',
  FAIL: 'var(--status-bad)',
};

function StatusPill({ status }: { status: DimensionStatus }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 44,
        textAlign: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}`,
      }}
    >
      {status}
    </span>
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
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Overall</span>
            <StatusPill status={data.overallStatus} />
            <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
              Checked {new Date(data.lastCheckedAt).toLocaleTimeString()}
            </span>
          </div>

          <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
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
                  <th scope="col" style={thStyle}>Status</th>
                  <th scope="col" style={thStyle}>Dimension</th>
                  <th scope="col" style={thStyle}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.dimensions.map((dim) => (
                  <tr key={dim.name} style={{ borderTop: '1px solid var(--line-2)' }}>
                    <td style={tdStyle}>
                      <StatusPill status={dim.status} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--ink)' }}>{dim.name}</td>
                    <td style={{ ...tdStyle, color: 'var(--ink-2)' }}>{dim.detail}</td>
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
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--ink-2)',
  background: 'var(--panel-2)',
  borderBottom: '1px solid var(--line)',
};

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.625rem',
  verticalAlign: 'middle',
};

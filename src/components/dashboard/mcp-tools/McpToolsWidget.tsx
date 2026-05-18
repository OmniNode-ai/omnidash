import type { CSSProperties } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useTimezone } from '@/hooks/useTimezone';

export interface McpToolRow {
  name: string;
  description: string;
  registeredAt: string;
  status: string;
  modelId: string;
  correlationId: string;
}

const NEW_THRESHOLD_MS = 30 * 60 * 1000;

export function isNew(registeredAt: string): boolean {
  return Date.now() - new Date(registeredAt).getTime() < NEW_THRESHOLD_MS;
}

export default function McpToolsWidget({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<McpToolRow>({
    topic: TOPICS.mcpTools,
    queryKey: ['mcp-tools'],
    refetchInterval: 15_000,
  });
  const tz = useTimezone();

  return (
    <ComponentWrapper
      title="MCP Tools Registry"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!data || data.length === 0}
      emptyMessage="No MCP tools registered"
      emptyHint="Tools appear after a successful generation + registration pipeline run"
    >
      {data && data.length > 0 && (
        <div style={{ border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '30%' }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                {['Tool', 'Description', 'Registered', ''].map((h) => (
                  <th key={h} scope="col" style={thStyle}>
                    <Text size="sm" weight="semibold" color="secondary" transform="uppercase" className="text-tracked">
                      {h}
                    </Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((tool) => (
                <tr key={tool.name} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td style={tdStyle}>
                    <Text size="lg" weight="semibold" color="primary">{tool.name}</Text>
                  </td>
                  <td style={tdStyle}>
                    <Text size="lg" color="secondary">{tool.description}</Text>
                  </td>
                  <td style={tdStyle}>
                    <Text size="sm" color="tertiary">
                      {new Date(tool.registeredAt).toLocaleTimeString(undefined, { timeZone: tz })}
                    </Text>
                  </td>
                  <td style={tdStyle}>
                    {isNew(tool.registeredAt) && (
                      <Text
                        size="xs"
                        weight="bold"
                        color="ok"
                        className="text-tracked"
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--status-ok)',
                        }}
                      >
                        NEW
                      </Text>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

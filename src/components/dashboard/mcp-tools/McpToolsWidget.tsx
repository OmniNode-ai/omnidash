import type { CSSProperties } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useTimezone } from '@/hooks/useTimezone';
import { localeTime as fmtLocaleTime } from '@/theme/format';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in McpToolsWidget.static.css.
import './McpToolsWidget.static.css';

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
    refetchInterval: refreshInterval(),
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
        <div className="mcp-tools-widget-s5375b8">
          <table className="mcp-tools-widget-sfdb3d2">
            <colgroup>
              <col className="mcp-tools-widget-safc576" />
              <col />
              <col className="mcp-tools-widget-s807e51" />
              <col className="mcp-tools-widget-sd4260d" />
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
                <tr className="mcp-tools-widget-s2102bd" key={tool.name}>
                  <td style={tdStyle}>
                    <Text size="lg" weight="semibold" color="primary">{tool.name}</Text>
                  </td>
                  <td style={tdStyle}>
                    <Text size="lg" color="secondary">{tool.description}</Text>
                  </td>
                  <td style={tdStyle}>
                    <Text size="sm" color="tertiary">
                      {fmtLocaleTime(new Date(tool.registeredAt), undefined, { timeZone: tz })}
                    </Text>
                  </td>
                  <td style={tdStyle}>
                    {isNew(tool.registeredAt) && (
                      <Text
                        size="xs"
                        weight="bold"
                        color="ok"
                        className="text-tracked mcp-tools-widget-s106067"
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
  background: 'var(--ds-surface-2)',
  borderBottom: '1px solid var(--ds-line)',
};

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.625rem',
  verticalAlign: 'middle',
};

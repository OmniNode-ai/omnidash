import { Text } from '@/components/ui/typography';

export type ServiceStatus = 'up' | 'down' | 'demo';

interface StatusIndicatorProps {
  label: string;
  status: ServiceStatus;
}

const STATUS_COLORS: Record<ServiceStatus, string> = {
  up: 'var(--status-ok)',
  down: 'var(--status-bad)',
  demo: 'var(--status-warn)',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  up: 'Connected',
  down: 'Offline',
  demo: 'Fixture',
};

function StatusIndicator({ label, status }: StatusIndicatorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status],
          boxShadow:
            status === 'up'
              ? `0 0 0 3px color-mix(in srgb, ${STATUS_COLORS[status]} 20%, transparent)`
              : 'none',
          flexShrink: 0,
        }}
      />
      <Text size="sm" weight="semibold" color="primary">
        {label}
      </Text>
      <Text size="xs" color="tertiary">
        {STATUS_LABELS[status]}
      </Text>
    </div>
  );
}

export function PipelineStatusBar({
  kafka,
  runtime,
  mcp,
}: {
  kafka: ServiceStatus;
  runtime: ServiceStatus;
  mcp: ServiceStatus;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: 6,
      }}
    >
      <StatusIndicator label="Kafka" status={kafka} />
      <StatusIndicator label="Runtime" status={runtime} />
      <StatusIndicator label="MCP" status={mcp} />
    </div>
  );
}

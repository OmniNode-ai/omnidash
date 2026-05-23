import { useDataSourceMode } from '@/hooks/useDataSourceMode';
import { Text } from '@/components/ui/typography';

const BANNER_CONFIG = {
  file: {
    message: 'Fixture Mode — data shown is for development only',
    bg: 'var(--status-warn)',
    color: 'var(--panel)',
  },
  sqlite: {
    message: 'Local Data (SQLite) — not connected to live infrastructure',
    bg: 'var(--brand-soft)',
    color: 'var(--brand-ink)',
  },
} as const;

export function DataModeBanner() {
  const mode = useDataSourceMode();
  const config = BANNER_CONFIG[mode as keyof typeof BANNER_CONFIG];

  if (!config) return null;

  return (
    <div
      data-testid="data-mode-banner"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5px 16px',
        background: config.bg,
        color: config.color,
      }}
    >
      <Text size="sm" weight="semibold" color="inherit">
        {config.message}
      </Text>
    </div>
  );
}

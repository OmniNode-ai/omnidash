import { useEffect, useState } from 'react';
import { Text, Heading } from '@/components/ui/typography';

export interface FeatureFlag {
  name: string;
  value: string | null;
  state: 'on' | 'off' | 'migration';
  service: 'omniclaude' | 'omnidash';
  description: string;
}

interface FlagsResponse {
  flags: FeatureFlag[];
  fetchedAt: string;
}

function isFlagsResponse(v: unknown): v is FlagsResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'flags' in v &&
    Array.isArray((v as FlagsResponse).flags) &&
    'fetchedAt' in v &&
    typeof (v as FlagsResponse).fetchedAt === 'string'
  );
}

const OMNIDASH_FLAGS: FeatureFlag[] = [
  { name: 'ENABLE_EVENT_INTELLIGENCE',    value: null, state: 'off', service: 'omnidash', description: 'Enables event intelligence processing pipeline' },
  { name: 'ENABLE_KAFKA_LOGGING',         value: null, state: 'off', service: 'omnidash', description: 'Routes structured logs through Kafka' },
  { name: 'ENABLE_REAL_TIME_EVENTS',      value: null, state: 'off', service: 'omnidash', description: 'Opens WebSocket channel for live event stream' },
  { name: 'ENABLE_PATTERN_ENFORCEMENT',   value: null, state: 'off', service: 'omnidash', description: 'Enforces pattern quality filters on incoming events' },
  { name: 'ENABLE_EVENT_PRELOAD',         value: null, state: 'off', service: 'omnidash', description: 'Pre-fetches events on dashboard mount' },
  { name: 'ENABLE_RESPONSE_CACHE',        value: null, state: 'off', service: 'omnidash', description: 'Enables response-level projection cache' },
  { name: 'ARCHON_ENABLE_EXTERNAL_GATEWAY', value: null, state: 'migration', service: 'omnidash', description: 'Routes inference through external Archon gateway' },
  { name: 'VITE_USE_MOCK_DATA',           value: null, state: 'off', service: 'omnidash', description: 'Forces fixture data in place of live projections' },
  { name: 'OMNIDASH_READ_MODEL_USE_CATALOG', value: null, state: 'migration', service: 'omnidash', description: 'Switches read model to catalog-based source' },
];

function resolveState(value: string | null): 'on' | 'off' | 'migration' {
  if (value === null || value === '' || value === '0' || value.toLowerCase() === 'false') return 'off';
  return 'on';
}

const STATE_STYLE: Record<string, React.CSSProperties> = {
  on: {
    padding: '2px 8px',
    borderRadius: 4,
    background: 'color-mix(in oklch, var(--status-ok) 20%, transparent)',
    border: '1px solid var(--status-ok)',
    color: 'var(--status-ok)',
    whiteSpace: 'nowrap' as const,
  },
  off: {
    padding: '2px 8px',
    borderRadius: 4,
    background: 'color-mix(in oklch, var(--color-error, oklch(62% 0.18 25)) 20%, transparent)',
    border: '1px solid var(--color-error, oklch(62% 0.18 25))',
    color: 'var(--color-error, oklch(62% 0.18 25))',
    whiteSpace: 'nowrap' as const,
  },
  migration: {
    padding: '2px 8px',
    borderRadius: 4,
    background: 'color-mix(in oklch, var(--status-warn) 20%, transparent)',
    border: '1px solid var(--status-warn)',
    color: 'var(--status-warn)',
    whiteSpace: 'nowrap' as const,
  },
};

function StateBadge({ state }: { state: 'on' | 'off' | 'migration' }) {
  const labels = { on: 'ON', off: 'OFF', migration: 'MIGRATION' };
  return (
    <Text
      as="span"
      size="xs"
      weight="semibold"
      family="mono"
      transform="uppercase"
      style={STATE_STYLE[state]}
    >
      {labels[state]}
    </Text>
  );
}

function ServiceTag({ service }: { service: 'omniclaude' | 'omnidash' }) {
  return (
    <Text
      as="span"
      size="xs"
      color="tertiary"
      family="mono"
      style={{
        padding: '2px 6px',
        borderRadius: 4,
        background: 'var(--surface-2, oklch(18% 0.01 260))',
        whiteSpace: 'nowrap',
      }}
    >
      {service}
    </Text>
  );
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border, oklch(20% 0.01 260))',
      }}
    >
      <td style={{ padding: '10px 12px' }}>
        <Text size="sm" family="mono">{flag.name}</Text>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <StateBadge state={flag.state} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        {flag.value !== null ? (
          <Text size="sm" color="tertiary" family="mono">{flag.value}</Text>
        ) : (
          <Text size="sm" color="tertiary" family="mono">
            <em style={{ opacity: 0.5 }}>unset</em>
          </Text>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <ServiceTag service={flag.service} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <Text size="sm" color="secondary">{flag.description}</Text>
      </td>
    </tr>
  );
}

function TableHeader({ label }: { label: string }) {
  return (
    <th style={{ padding: '8px 12px', textAlign: 'left' }}>
      <Text size="xs" color="tertiary" weight="semibold" transform="uppercase">
        {label}
      </Text>
    </th>
  );
}

function FlagTable({ flags, title }: { flags: FeatureFlag[]; title: string }) {
  const onCount = flags.filter((f) => f.state === 'on').length;
  const offCount = flags.filter((f) => f.state === 'off').length;
  const migrationCount = flags.filter((f) => f.state === 'migration').length;

  return (
    <div
      style={{
        background: 'var(--surface, oklch(14% 0.01 260))',
        border: '1px solid var(--border, oklch(20% 0.01 260))',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, oklch(20% 0.01 260))',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Heading level={3} size="sm">{title}</Heading>
        <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <Text size="sm" color="ok">{onCount} on</Text>
          <Text size="sm" color="tertiary">{offCount} off</Text>
          {migrationCount > 0 && (
            <Text size="sm" color="warn">{migrationCount} migration</Text>
          )}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
            {['Flag', 'State', 'Value', 'Service', 'Description'].map((h) => (
              <TableHeader key={h} label={h} />
            ))}
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <FlagRow key={flag.name} flag={flag} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeatureFlagDashboard() {
  const [serverFlags, setServerFlags] = useState<FeatureFlag[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl = (import.meta.env.VITE_SERVER_BASE_URL as string | undefined) ?? '';
    fetch(`${baseUrl}/api/settings/feature-flags`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isFlagsResponse(body)) throw new Error('Unexpected response shape');
        const hydrated = body.flags.map((f) => ({
          ...f,
          state: resolveState(f.value),
        }));
        setServerFlags(hydrated);
        setFetchedAt(body.fetchedAt);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // In file-mode (no Express server), fall back to client-side env vars
  const omnidashFlags = serverFlags
    ? serverFlags.filter((f) => f.service === 'omnidash')
    : OMNIDASH_FLAGS.map((f) => ({
        ...f,
        value: (import.meta.env[f.name] as string | undefined) ?? null,
        state: resolveState((import.meta.env[f.name] as string | undefined) ?? null),
      }));

  const omniclaudeFlags = serverFlags?.filter((f) => f.service === 'omniclaude') ?? [];

  const totalOn = [...omnidashFlags, ...omniclaudeFlags].filter((f) => f.state === 'on').length;
  const totalMigration = [...omnidashFlags, ...omniclaudeFlags].filter((f) => f.state === 'migration').length;

  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Feature Flags</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text size="sm" color="secondary">
              {loading ? 'Loading…' : error ? 'Server unavailable — showing client env' : 'Live from server'}
            </Text>
            {fetchedAt && (
              <Text size="sm" color="tertiary">
                · {new Date(fetchedAt).toLocaleTimeString()}
              </Text>
            )}
          </div>
        </div>
        <div className="header-actions" style={{ gap: 12 }}>
          <Text size="sm" color="ok">{totalOn} active</Text>
          {totalMigration > 0 && (
            <Text size="sm" color="warn">{totalMigration} migration</Text>
          )}
        </div>
      </div>

      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        <FlagTable
          flags={omnidashFlags}
          title="omnidash"
        />

        {omniclaudeFlags.length > 0 && (
          <FlagTable
            flags={omniclaudeFlags}
            title="omniclaude"
          />
        )}

        {omniclaudeFlags.length === 0 && !loading && (
          <div
            style={{
              background: 'var(--surface, oklch(14% 0.01 260))',
              border: '1px solid var(--border, oklch(20% 0.01 260))',
              borderRadius: 8,
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <Text color="tertiary" size="sm">
              omniclaude flags not available — server endpoint required to read server-side env vars.
            </Text>
          </div>
        )}
      </div>
    </>
  );
}

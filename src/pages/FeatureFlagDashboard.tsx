import { useEffect, useState } from 'react';
import { Text, Heading } from '@/components/ui/typography';
import { fetchFeatureFlags } from '@/services/feature-flag-service';
import '@/styles/feature-flags.css';
import { localeTime as fmtLocaleTime } from '@/lib/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in FeatureFlagDashboard.static.css.
import './FeatureFlagDashboard.static.css';

export interface FeatureFlag {
  name: string;
  value: string | null;
  state: 'on' | 'off' | 'migration';
  service: 'omniclaude' | 'omnidash';
  description: string;
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
    background: 'color-mix(in oklch, var(--ds-status-ok) 20%, transparent)',
    border: '1px solid var(--ds-status-ok)',
    color: 'var(--ds-status-ok)',
    whiteSpace: 'nowrap' as const,
  },
  off: {
    padding: '2px 8px',
    borderRadius: 4,
    background: 'color-mix(in oklch, var(--ds-bad, var(--ds-hue-red)) 20%, transparent)',
    border: '1px solid var(--ds-bad, var(--ds-bad))',
    color: 'var(--ds-bad, var(--ds-bad))',
    whiteSpace: 'nowrap' as const,
  },
  migration: {
    padding: '2px 8px',
    borderRadius: 4,
    background: 'color-mix(in oklch, var(--ds-warn) 20%, transparent)',
    border: '1px solid var(--ds-warn)',
    color: 'var(--ds-warn)',
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
    <Text className="feature-flag-dashboard-s73678e"
      as="span"
      size="xs"
      color="tertiary"
      family="mono"
    >
      {service}
    </Text>
  );
}

/* Desktop table row */
function FlagTableRow({ flag }: { flag: FeatureFlag }) {
  return (
    <tr className="flag-tr">
      <td className="flag-td"><Text size="sm" family="mono">{flag.name}</Text></td>
      <td className="flag-td"><StateBadge state={flag.state} /></td>
      <td className="flag-td">
        {flag.value !== null
          ? <Text size="sm" color="tertiary" family="mono">{flag.value}</Text>
          : <Text size="sm" color="tertiary" family="mono"><em className="feature-flag-dashboard-sdb9ab8">unset</em></Text>}
      </td>
      <td className="flag-td"><ServiceTag service={flag.service} /></td>
      <td className="flag-td"><Text size="sm" color="secondary">{flag.description}</Text></td>
    </tr>
  );
}

/* Mobile card row */
function FlagCard({ flag }: { flag: FeatureFlag }) {
  return (
    <div className="flag-row">
      <div className="flag-row-main">
        <Text as="span" size="sm" family="mono" className="flag-name">{flag.name}</Text>
        <div className="flag-row-badges">
          <ServiceTag service={flag.service} />
          <StateBadge state={flag.state} />
        </div>
      </div>
      <Text as="p" size="sm" color="secondary" className="flag-desc">{flag.description}</Text>
    </div>
  );
}

function FlagTable({ flags, title }: { flags: FeatureFlag[]; title: string }) {
  const onCount = flags.filter((f) => f.state === 'on').length;
  const offCount = flags.filter((f) => f.state === 'off').length;
  const migrationCount = flags.filter((f) => f.state === 'migration').length;

  return (
    <div className="flag-table">
      <div className="flag-table-head">
        <Heading level={3} size="sm">{title}</Heading>
        <span className="flag-table-counts">
          <Text size="sm" color="ok">{onCount} on</Text>
          <Text size="sm" color="tertiary">{offCount} off</Text>
          {migrationCount > 0 && (
            <Text size="sm" color="warn">{migrationCount} migration</Text>
          )}
        </span>
      </div>

      {/* ≥768px: original table */}
      <div className="flag-desktop-table">
        <table className="feature-flag-dashboard-s0bc69d">
          <thead>
            <tr className="feature-flag-dashboard-s99d8eb">
              {['Flag', 'State', 'Value', 'Service', 'Description'].map((h) => (
                <th key={h} className="flag-th">
                  <Text size="xs" color="tertiary" weight="semibold" transform="uppercase">{h}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => <FlagTableRow key={flag.name} flag={flag} />)}
          </tbody>
        </table>
      </div>

      {/* <768px: card list */}
      <div className="flag-mobile-list">
        {flags.map((flag) => <FlagCard key={flag.name} flag={flag} />)}
      </div>
    </div>
  );
}

/**
 * Source of the rendered flags.
 * - `live`   — the omnidash Express server answered `/api/settings/feature-flags`.
 * - `config` — the server is not wired into this dev session (plain `npm run dev`
 *              has no Express process; no `VITE_OMNIDASH_SERVER_URL` proxy). The
 *              panel falls back to client-side env. This is a normal local-dev
 *              CONFIG state, not an error.
 */
type ServerState = 'live' | 'config';

export function FeatureFlagDashboard() {
  const [serverFlags, setServerFlags] = useState<FeatureFlag[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverState, setServerState] = useState<ServerState>('config');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    // OMN-13065: fetch migrated behind fetchFeatureFlags() seam in src/services/feature-flag-service.ts.
    // A non-OK status, or an HTML body from the SPA history fallback (when
    // no `/api/settings` proxy is configured), means the server is not wired
    // into this dev session. Surface the client-env config state — not an
    // error — so the console and UI stay honest about WHY.
    const baseUrl = (import.meta.env.VITE_SERVER_BASE_URL as string | undefined) ?? '';
    fetchFeatureFlags(baseUrl)
      .then(({ flags, fetchedAt }) => {
        const hydrated = flags.map((f) => ({
          ...f,
          state: resolveState(f.value),
        }));
        setServerFlags(hydrated as FeatureFlag[]);
        setFetchedAt(fetchedAt);
        setServerState('live');
      })
      .catch(() => {
        setServerState('config');
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
          <div className="feature-flag-dashboard-s636ba8">
            <Text size="sm" color="secondary">
              {loading
                ? 'Loading…'
                : serverState === 'live'
                  ? 'Live from server'
                  : 'Client env · flag server not connected'}
            </Text>
            {fetchedAt && (
              <Text size="sm" color="tertiary">
                · {fmtLocaleTime(new Date(fetchedAt))}
              </Text>
            )}
          </div>
        </div>
        <div className="header-actions feature-flag-dashboard-sb6e62f">
          <Text size="sm" color="ok">{totalOn} active</Text>
          {totalMigration > 0 && (
            <Text size="sm" color="warn">{totalMigration} migration</Text>
          )}
        </div>
      </div>

      <div className="dash-body feature-flag-dashboard-sdb6e0e">
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
          <div className="feature-flag-dashboard-sa09116"
          >
            <Text color="tertiary" size="sm">
              omniclaude flags unavailable · flag server not connected.
              The table above reflects client-side env only.
            </Text>
          </div>
        )}
      </div>
    </>
  );
}

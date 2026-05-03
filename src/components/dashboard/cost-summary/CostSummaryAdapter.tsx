import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';

type CostSummaryConfig = Record<string, never>;

interface CostRow {
  total_cost_usd?: number;
  total_savings_usd?: number;
  total_tokens?: number;
  usage_source?: string;
}

function formatCurrency(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

function KPITile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius, 6px)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <Text size="xs" color="tertiary" transform="uppercase" className="text-tracked">
        {label}
      </Text>
      <Text size="2xl" weight="semibold" tabularNums style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" color="tertiary">{sub}</Text>
      )}
    </div>
  );
}

function SavingsBar({ cost, savings }: { cost: number; savings: number }) {
  const total = cost + savings;
  if (total <= 0) return null;
  const costPct = (cost / total) * 100;
  const savingsPct = (savings / total) * 100;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text size="sm" weight="semibold" color="secondary">
          Savings vs. Full Cloud Pricing
        </Text>
        <Text size="sm" family="mono" tabularNums color="secondary">
          {formatCurrency(savings)} saved of {formatCurrency(total)} equivalent
        </Text>
      </div>
      <div
        style={{
          display: 'flex',
          height: 28,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--line)',
        }}
      >
        {savings > 0 && (
          <div
            style={{
              width: `${savingsPct}%`,
              background: 'var(--color-good, #22c55e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: savingsPct > 12 ? 'auto' : 0,
            }}
          >
            {savingsPct > 12 && (
              <Text size="xs" weight="semibold" style={{ color: '#fff' }}>
                {savingsPct.toFixed(0)}% local (free)
              </Text>
            )}
          </div>
        )}
        {cost > 0 && (
          <div
            style={{
              width: `${costPct}%`,
              background: 'var(--color-warn, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: costPct > 12 ? 'auto' : 0,
            }}
          >
            {costPct > 12 && (
              <Text size="xs" weight="semibold" style={{ color: '#fff' }}>
                {costPct.toFixed(0)}% cloud
              </Text>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-good, #22c55e)' }} />
          <Text size="xs" color="secondary">Routed to local models ($0)</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-warn, #f59e0b)' }} />
          <Text size="xs" color="secondary">Cloud API (paid)</Text>
        </div>
      </div>
    </div>
  );
}

export default function CostSummaryAdapter(_config: CostSummaryConfig) {
  const { data, isLoading, error } = useProjectionQuery<CostRow>({
    queryKey: ['cost-summary', TOPICS.costSummary],
    topic: TOPICS.costSummary,
  });

  const row = data?.[0] ?? null;

  const stats = useMemo(() => {
    if (!row) return null;
    const cost = typeof row.total_cost_usd === 'number' ? row.total_cost_usd : 0;
    const savings = typeof row.total_savings_usd === 'number' ? row.total_savings_usd : 0;
    const tokens = typeof row.total_tokens === 'number' ? row.total_tokens : 0;
    const savingsPct = cost + savings > 0 ? (savings / (cost + savings)) * 100 : 0;
    return { cost, savings, tokens, savingsPct };
  }, [row]);

  const usageSource = row?.usage_source;

  const headerExtra = usageSource ? (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 10,
        border: '1px solid var(--status-ok, #22c55e)',
        background: 'color-mix(in srgb, var(--status-ok, #22c55e) 12%, transparent)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-ok, #22c55e)', flexShrink: 0 }} />
      <Text size="xs" family="mono" weight="semibold" color="secondary">{usageSource}</Text>
    </div>
  ) : undefined;

  const isEmpty = !stats;

  return (
    <ComponentWrapper
      title="Cost Summary"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No cost summary data"
      emptyHint="Cost summary appears after LLM calls are tracked"
      headerExtra={headerExtra}
    >
      {stats && (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div style={{ display: 'flex', gap: 'var(--row-gap, 12px)', width: '100%' }}>
            <KPITile
              label="Total Cloud Spend"
              value={formatCurrency(stats.cost)}
              sub="API costs incurred"
              color="var(--color-warn, #f59e0b)"
            />
            <KPITile
              label="Cloud Cost Avoided"
              value={formatCurrency(stats.savings)}
              sub={`${stats.savingsPct.toFixed(0)}% of workload routed to local models`}
              color="var(--color-good, #22c55e)"
            />
            <KPITile
              label="Tokens Processed"
              value={formatTokens(stats.tokens)}
              sub="across all models"
            />
          </div>
          <SavingsBar cost={stats.cost} savings={stats.savings} />
        </div>
      )}
    </ComponentWrapper>
  );
}

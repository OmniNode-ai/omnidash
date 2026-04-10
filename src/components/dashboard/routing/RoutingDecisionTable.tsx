import { ComponentWrapper } from '../ComponentWrapper';
import { useComponentData } from '@/hooks/useComponentData';

interface RoutingDecision {
  id: string;
  created_at: string;
  llm_agent: string;
  fuzzy_agent: string;
  agreement: boolean;
  llm_confidence: number;
  fuzzy_confidence: number;
  cost_usd: number;
}

export default function RoutingDecisionTable({ config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useComponentData<RoutingDecision[]>(
    '/api/llm-routing/decisions',
    { queryKey: ['routing-decisions'], refetchInterval: 60_000 }
  );

  const isEmpty = !data || data.length === 0;

  return (
    <ComponentWrapper
      title="Routing Decisions"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No routing decisions"
      emptyHint="Decisions appear after LLM routing events are recorded"
    >
      {data && !isEmpty && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              {['Timestamp', 'LLM Agent', 'Fuzzy Agent', 'Agreement', 'LLM Conf.', 'Cost'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '0.25rem 0.5rem', opacity: 0.6, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: '0.25rem 0.5rem' }}>{new Date(row.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{row.llm_agent}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{row.fuzzy_agent}</td>
                <td style={{ padding: '0.25rem 0.5rem', color: row.agreement ? 'var(--color-healthy)' : 'var(--color-destructive)' }}>
                  {row.agreement ? 'Agree' : 'Disagree'}
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{(row.llm_confidence * 100).toFixed(0)}%</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>${row.cost_usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ComponentWrapper>
  );
}

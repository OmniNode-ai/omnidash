import { CONCEPT_ICONS } from '@/design-system/icons';
import { fieldTone, isUnavailableField } from './field-identity';
import { tierColor } from '@/lib/dashboard-colors';
import type { CSSProperties } from 'react';
import { useModelIdentityStyle } from '@/components/dashboard/model-tiers';


/** Canonical readable names for consumers whose label is not a field alias. */
export const CONCEPT_LABELS: Readonly<Record<string, string>> = {
  pass: 'Passed', fail: 'Failed', count: 'Checks', score: 'Quality score', threshold: 'Required bar',
  model: 'Model', age: 'Age', identity: 'Run', duration: 'Duration', cost: 'Actual spend',
  savings: 'Savings', backend: 'Backend', host: 'Host', 'tokens-in': 'Input tokens',
  'tokens-out': 'Output tokens', tokens: 'Tokens', basis: 'Data basis', task: 'Task',
  tier: 'Tier', queue: 'Queue wait', execution: 'Execution', completion: 'Completion',
  calls: 'Agent calls', tenant: 'Tenant', session: 'Session', baseline: 'Baseline spend',
  'saving-average': 'Average saving per call', compression: 'Compression', cache: 'Cache hit rate',
  quality: 'Quality', events: 'Pipeline events', generation: 'Generation rows', transport: 'Transport',
  delegations: 'Delegations', routing: 'Tier-routed', unrouted: 'Without a tier', contract: 'Contract pass',
  unavailable: 'Not recorded', recent: 'Recent runs', last: 'Last run', analysis: 'Activity analysis',
  'spend-daily': 'Spend per day', 'tokens-daily': 'Tokens per day', 'savings-daily': 'Savings per day',
  'usage-day': 'Usage by model and day', credentials: 'Credentials', 'local-identity': 'Local identity', 'local-access': 'Dashboard access',
  'cloud-keys': 'Cloud keys', path: 'Run path', 'local-run': 'Local runs',
  'run-outcome': 'Run outcome', 'routing-model': 'Routing and model', 'tokens-completion': 'Tokens and completion',
  timing: 'Run timing', 'run-details': 'Recorded run details', 'stage-timing': 'Execution stage durations',
  answer: 'Answer', 'routing-flow': 'Recorded routing flow', 'token-flow': 'Token flow',
  'quality-comparison': 'Quality score and threshold',
  'tier-local': 'local', 'tier-harness': 'harness', 'tier-cheap-frontier': 'cheap_frontier',
  'tier-cheap-cloud': 'cheap_cloud', 'tier-cloud': 'cloud', 'tier-claude': 'claude',
  'tier-frontier': 'frontier', 'tier-customer-keys': 'customer_keys', 'tier-other': 'Other tier',
  'step-request': 'Request', 'step-routing': 'Routing decision', 'step-provider-call': 'Provider call',
  'step-quality': 'Quality gate step', 'step-terminal': 'Terminal', 'step-other': 'Other step',
  'runs-daily': 'Runs per day', 'pass-rate-daily': 'Pass rate per day',
  'activity-hourly': 'Activity by UTC hour', 'quality-model': 'Model scoreboard',
  failures: 'Why runs failed', 'runs-model': 'Runs by model', 'runs-tier': 'Runs by tier',
  'spend-model': 'Spend by model', 'cost-per-run': 'Cost per run', 'tokens-model': 'Tokens in vs out by model',
  'cost-route': 'Cost by route', activity: 'Activity over time', 'routing-workload': 'Routing and workload',
  'quality-outcomes': 'Quality and outcomes', 'performance-model': 'Performance by model',
  'task-document': 'document', 'task-code-generation': 'code_generation', 'task-research': 'research',
  'task-summarization': 'summarization', 'task-code-review': 'code_review', 'task-test': 'test', 'task-other': 'Other task',
  'tier-mix': 'Tier mix', 'usage-analysis': 'Usage analysis',
  'load-slow': 'Data read delayed', 'load-error': 'Data read failed',
  selected: 'Selected run', 'recorded-rows': 'Recorded rows',
  'runs-analysis': 'Analysis views', 'run-routes': 'Routing',
  'duration-p95': 'p95 duration', escalated: 'Escalated runs',
};

export function ConceptIcon({ concept, label, value, size = 12 }: { concept: string; label?: string; value?: unknown; size?: number }) {
  const modelIdentityStyle = useModelIdentityStyle();
  const Icon = CONCEPT_ICONS[concept];
  const model = concept === 'model' && typeof value === 'string' && !isUnavailableField(value) ? value : null;
  const tier = concept.startsWith('tier-') && typeof value === 'string' ? value : null;
  const customTier = concept === 'tier-other' && tier && !isUnavailableField(tier) && !/^none$/i.test(tier) ? tier : null;
  const style = model ? { ...modelIdentityStyle(model), '--field-ink': 'var(--model-identity-color)' } as CSSProperties
    : tier !== null ? { '--field-ink': tierColor(tier) } as CSSProperties : undefined;
  return Icon ? <Icon className="field-icon" data-field-icon={concept} data-field-tone={concept}
    data-semantic-concept={model ? `model:${model}` : customTier ? `tier:${customTier}` : `field:${concept}`} data-semantic-label={model ?? tier ?? label ?? CONCEPT_LABELS[concept]}
    style={style} size={size} aria-hidden="true" focusable="false" /> : null;
}
export function FieldIcon({ label, value, tone, size = 12 }: {
  label?: unknown; value?: unknown; tone?: string; size?: number;
}) {
  const identity = tone ?? fieldTone(label, value);
  return identity ? <ConceptIcon concept={identity} label={typeof label === 'string' ? label : undefined} value={value} size={size} /> : null;
}

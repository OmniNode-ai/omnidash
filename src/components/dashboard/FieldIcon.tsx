import {
  Activity, ArrowDown, ArrowDownUp, ArrowUp, Award, BadgeInfo, Blocks, Bot, BrainCircuit, Building2, CalendarDays,
  CircleCheck, CircleDot, CircleDollarSign, CircleX, Clock3, Coins, Cpu, DatabaseZap,
  ChartColumn, ChartColumnStacked, ChartLine, ChartSpline, CircleHelp, Cloud, CloudOff, CodeXml, FileClock, FileText, Filter, Fingerprint, FingerprintPattern, Flag, FlaskConical, Gauge, GitPullRequest, Globe, History, Hourglass, IdCard, Inbox, KeyRound, Layers, ListChecks, MessageSquareText, MessagesSquare,
  Monitor, Network, PiggyBank, PlugZap, Radio, Route, RouteOff, Scale, ScanSearch, ShieldCheck, Shrink,
  Rows3, ScrollText, Sparkles, Star, TableProperties, Timer, TrendingDown, Server, Waypoints, Zap, type LucideIcon,
} from 'lucide-react';
import { fieldTone, isUnavailableField } from './field-identity';
import { modelIdentityStyle } from './model-identity';
import { tierColor } from '@/lib/dashboard-colors';
import type { CSSProperties } from 'react';

/** Canonical field identities, reused wherever the same fact is displayed. */
export const FIELD_ICONS: Readonly<Record<string, LucideIcon>> = {
  pass: CircleCheck, fail: CircleX, count: ListChecks, score: Star, threshold: Gauge,
  model: BrainCircuit, age: Clock3, identity: Fingerprint, duration: Timer,
  cost: CircleDollarSign, savings: PiggyBank, backend: Server, host: Monitor,
  'tokens-in': ArrowDown, 'tokens-out': ArrowUp, tokens: Coins, basis: BadgeInfo,
  task: FileText, tier: Layers, queue: Hourglass, execution: Zap, completion: Flag,
  calls: Bot, tenant: Building2, session: MessagesSquare, baseline: Scale,
  'saving-average': TrendingDown, compression: Shrink, cache: DatabaseZap,
  quality: Award, events: Activity, generation: Blocks, transport: Radio,
  delegations: Network, routing: Route, unrouted: RouteOff, contract: ShieldCheck,
  unavailable: CircleDot, 'tier-harness': Cpu, 'step-provider-call': PlugZap,
  recent: Rows3, last: History, analysis: ChartSpline,
  'spend-daily': ChartLine, 'tokens-daily': ArrowDownUp, 'savings-daily': CalendarDays,
  'usage-day': TableProperties, credentials: KeyRound, 'local-identity': IdCard, 'local-access': FingerprintPattern,
  'cloud-keys': CloudOff, path: Route, 'local-run': Server,
  'run-outcome': Award, 'routing-model': Waypoints, 'tokens-completion': Coins,
  timing: Timer, 'run-details': FileClock, 'stage-timing': Timer,
  answer: MessageSquareText, 'routing-flow': Waypoints, 'token-flow': Coins,
  'quality-comparison': Award,
  'tier-local': Server, 'tier-cheap-frontier': Zap, 'tier-cheap-cloud': Cloud,
  'tier-cloud': Cloud, 'tier-claude': Sparkles, 'tier-frontier': Sparkles,
  'tier-customer-keys': KeyRound, 'tier-other': Route,
  'step-request': Inbox, 'step-routing': Route, 'step-quality': ShieldCheck,
  'step-terminal': Flag, 'step-other': CircleDot,
  'runs-daily': CalendarDays, 'pass-rate-daily': ChartLine, 'activity-hourly': Clock3,
  'quality-model': Award, failures: CircleX, 'runs-model': BrainCircuit, 'runs-tier': Layers,
  'spend-model': CircleDollarSign, 'cost-per-run': Scale, 'tokens-model': ArrowDownUp,
  'cost-route': Route, activity: Activity, 'routing-workload': Waypoints,
  'quality-outcomes': ShieldCheck, 'performance-model': ChartColumn,
  'task-document': FileText, 'task-code-generation': CodeXml, 'task-research': Globe,
  'task-summarization': ScrollText, 'task-code-review': GitPullRequest,
  'task-test': FlaskConical, 'task-other': CircleHelp,
  'tier-mix': Waypoints, 'usage-analysis': ChartColumnStacked,
  'load-slow': Hourglass, 'load-error': CloudOff,
  selected: ScanSearch, 'recorded-rows': Filter,
};

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
};

export function ConceptIcon({ concept, label, value, size = 12 }: { concept: string; label?: string; value?: unknown; size?: number }) {
  const Icon = FIELD_ICONS[concept];
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

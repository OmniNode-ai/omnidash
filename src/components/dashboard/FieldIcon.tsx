import {
  Antenna, ArrowDown, ArrowLeftRight, ArrowUp, Award, BadgeInfo, Banknote, Bot, Boxes, Brain, BrainCircuit,
  Building2, CalendarClock, CalendarDays, CalendarRange, ChartArea, ChartBar, ChartBarStacked, ChartColumnStacked,
  ChartGantt, ChartLine, ChartPie, ChartSpline, CheckCheck, CircleCheck, CircleDollarSign, CircleDot, CircleEllipsis,
  CircleHelp, CircleX, ClipboardCheck, Clock3, Cloud, Cloudy, CodeXml, Coins, Cpu, DatabaseZap, Divide, Feather,
  FileClock, FileText, Files, Fingerprint, Flag, FlagTriangleRight, Footprints, GitBranch,
  GitPullRequest, Globe, HardDrive, Hash, History, Hourglass, House, IdCard, Inbox, Key, KeyRound, Layers, Layers2,
  ListChecks, LockKeyhole, Logs, Medal, MessageSquareText, MessagesSquare, Milestone, Monitor, MousePointerClick,
  Network, OctagonAlert, Percent, PiggyBank, PlugZap, Receipt, Rocket, Route, RouteOff, Rows3, Ruler, Scale,
  ScrollText, Server, Sheet, ShieldCheck, Shrink, Shuffle, Signpost, Snail, Sparkles, Split, Star, TableProperties,
  Target, TestTube, Timer, TimerReset, TrendingUp, TriangleAlert, Trophy, UserLock, Waypoints, Zap, type LucideIcon
} from 'lucide-react';
import { fieldTone, isUnavailableField } from './field-identity';
import { modelIdentityStyle } from './model-identity';
import { tierColor } from '@/lib/dashboard-colors';
import type { CSSProperties } from 'react';

/**
 * Canonical field identities, reused wherever the same fact is displayed. OMN-21166 part 28a (Lakshman 2026-10-27, grey
 * icons with unique glyphs): every concept has its own glyph, so a concept stays unique by shape alone now that interface
 * icons are grey (OMN-21308 AC1); colour stays on the data.
 */
export const FIELD_ICONS: Readonly<Record<string, LucideIcon>> = {
  pass: CircleCheck, fail: CircleX, count: ListChecks, score: Star, threshold: Ruler,
  model: BrainCircuit, age: Clock3, identity: Fingerprint, duration: Timer,
  cost: CircleDollarSign, savings: PiggyBank, backend: Server, host: Monitor,
  'tokens-in': ArrowDown, 'tokens-out': ArrowUp, tokens: Coins, basis: BadgeInfo,
  task: FileText, tier: Layers, queue: Hourglass, execution: Zap, completion: Flag,
  calls: Bot, tenant: Building2, session: MessagesSquare, baseline: Scale,
  'saving-average': Divide, compression: Shrink, cache: DatabaseZap,
  quality: Award, events: Logs, generation: Boxes, transport: Antenna,
  delegations: Network, routing: Route, unrouted: RouteOff, contract: ShieldCheck,
  unavailable: CircleDot, 'tier-harness': Cpu, 'step-provider-call': PlugZap,
  recent: Rows3, last: History, analysis: ChartSpline,
  'spend-daily': ChartLine, 'tokens-daily': ChartArea, 'savings-daily': CalendarDays,
  'usage-day': TableProperties, credentials: KeyRound, 'local-identity': IdCard, 'local-access': UserLock,
  'cloud-keys': LockKeyhole, path: Footprints, 'local-run': HardDrive,
  'run-outcome': Trophy, 'routing-model': Waypoints, 'tokens-completion': Hash,
  timing: TimerReset, 'run-details': FileClock, 'stage-timing': ChartGantt,
  answer: MessageSquareText, 'routing-flow': GitBranch, 'token-flow': ArrowLeftRight,
  'quality-comparison': Target,
  'tier-local': House, 'tier-cheap-frontier': Feather, 'tier-cheap-cloud': Cloudy,
  'tier-cloud': Cloud, 'tier-claude': Sparkles, 'tier-frontier': Rocket,
  'tier-customer-keys': Key, 'tier-other': Signpost,
  'step-request': Inbox, 'step-routing': Split, 'step-quality': ClipboardCheck,
  'step-terminal': FlagTriangleRight, 'step-other': CircleEllipsis,
  'runs-daily': CalendarRange, 'pass-rate-daily': Percent, 'activity-hourly': CalendarClock,
  'quality-model': Medal, failures: OctagonAlert, 'runs-model': Brain, 'runs-tier': Layers2,
  'spend-model': Banknote, 'cost-per-run': Receipt, 'tokens-model': ChartBarStacked,
  'cost-route': Milestone, activity: TrendingUp, 'routing-workload': Shuffle,
  'quality-outcomes': CheckCheck, 'performance-model': ChartBar,
  'task-document': Files, 'task-code-generation': CodeXml, 'task-research': Globe,
  'task-summarization': ScrollText, 'task-code-review': GitPullRequest,
  'task-test': TestTube, 'task-other': CircleHelp,
  'tier-mix': ChartPie, 'usage-analysis': ChartColumnStacked,
  'load-slow': Snail, 'load-error': TriangleAlert,
  selected: MousePointerClick, 'recorded-rows': Sheet,
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

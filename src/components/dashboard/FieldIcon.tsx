import {
  Activity, ArrowDown, ArrowUp, Award, BadgeInfo, Blocks, Bot, BrainCircuit, Building2,
  CircleCheck, CircleDot, CircleDollarSign, CircleX, Clock3, Coins, DatabaseZap,
  FileText, Fingerprint, Flag, Gauge, Hourglass, Layers, ListChecks, MessagesSquare,
  Monitor, Network, PiggyBank, Radio, Route, RouteOff, Scale, ShieldCheck, Shrink,
  Star, Timer, TrendingDown, Server, Zap, type LucideIcon,
} from 'lucide-react';
import { fieldTone } from './field-identity';

/** Canonical field identities, reused wherever the same fact is displayed. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  pass: CircleCheck, fail: CircleX, count: ListChecks, score: Star, threshold: Gauge,
  model: BrainCircuit, age: Clock3, identity: Fingerprint, duration: Timer,
  cost: CircleDollarSign, savings: PiggyBank, backend: Server, host: Monitor,
  'tokens-in': ArrowDown, 'tokens-out': ArrowUp, tokens: Coins, basis: BadgeInfo,
  task: FileText, tier: Layers, queue: Hourglass, execution: Zap, completion: Flag,
  calls: Bot, tenant: Building2, session: MessagesSquare, baseline: Scale,
  'saving-average': TrendingDown, compression: Shrink, cache: DatabaseZap,
  quality: Award, events: Activity, generation: Blocks, transport: Radio,
  delegations: Network, routing: Route, unrouted: RouteOff, contract: ShieldCheck,
};
export function FieldIcon({ label, value, tone, size = 12 }: {
  label?: unknown; value?: unknown; tone?: string; size?: number;
}) {
  const identity = tone ?? fieldTone(label, value);
  const Icon = identity ? ICONS[identity] : typeof label === 'string' && label.toLowerCase() === 'status' ? CircleDot : undefined;
  return Icon ? <Icon className="field-icon" data-field-icon={identity ?? 'status'} size={size} aria-hidden="true" focusable="false" /> : null;
}

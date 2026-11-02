/**
 * OMN-22168 AC2: the one module that imports lucide-react. Every icon in OmniDash resolves through here, so a glyph is
 * chosen once per concept and a page never reaches into the icon library directly (ESLint no-restricted-imports and
 * tests/design-system/lint-guards.test.ts refuse an import anywhere else).
 *
 *   - CONCEPT_ICONS: the concept id -> glyph registry (moved from FieldIcon.tsx), the source for card, panel, field and
 *     section icons.
 *   - The named re-exports below: the interface glyphs (chevrons, close, play) and the concept glyphs, by their lucide
 *     names, for components that need one directly.
 */
import {
  Antenna, ArrowDown, ArrowLeftRight, ArrowUp, Award, BadgeInfo, Banknote, Bot, Boxes, Brain, BrainCircuit,
  Building2, CalendarClock, CalendarDays, CalendarRange, ChartArea, ChartBar, ChartBarStacked, ChartColumnStacked,
  ChartGantt, ChartLine, ChartPie, ChartSpline, CheckCheck, ChevronsUp, CircleCheck, CircleDollarSign, CircleDot,
  CircleEllipsis, CircleHelp, CircleX, ClipboardCheck, Clock3, Cloud, Cloudy, CodeXml, Cpu, DatabaseZap, Divide,
  Feather, FileClock, FileText, Files, Fingerprint, Flag, FlagTriangleRight, Footprints, Gauge, GitBranch, GitFork,
  GitPullRequest, Globe, HardDrive, Hash, History, Hourglass, House, IdCard, Inbox, Key, KeyRound, Layers, Layers2,
  ListChecks, LockKeyhole, Logs, Medal, MessageSquareText, MessagesSquare, Milestone, Monitor, MousePointerClick,
  Network, OctagonAlert, PanelsTopLeft, Percent, PiggyBank, PlugZap, Receipt, Rocket, Route, RouteOff, Rows3, Ruler,
  Scale, ScrollText, Server, Sheet, ShieldCheck, Shrink, Shuffle, Signpost, Snail, Sparkles, Split, Star,
  TableProperties, Target, TestTube, Timer, TimerReset, TrendingUp, TriangleAlert, Trophy, UserLock, Waypoints,
  WholeWord, Zap,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon, LucideProps } from 'lucide-react';
export {
  Activity, AlertCircle, Antenna, Archive, ArrowDown, ArrowDownRight, ArrowLeftRight, ArrowUp, ArrowUpRight, Award,
  BadgeCheck, BadgeInfo, Banknote, BarChart2, BellRing, Blocks, Bot, Boxes, Brain, BrainCircuit, Building2, Calendar,
  CalendarClock, CalendarDays, CalendarRange, ChartArea, ChartBar, ChartBarStacked, ChartColumn, ChartColumnStacked,
  ChartGantt, ChartLine, ChartPie, ChartSpline, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ChevronsLeft, ChevronsRight, ChevronsUp, CircleCheck, CircleDollarSign, CircleDot, CircleEllipsis, CircleHelp,
  CircleX, ClipboardCheck, Clock3, Cloud, Cloudy, CodeXml, Copy, Cpu, Database, DatabaseZap, Divide, DollarSign,
  Edit, Feather, FileCheck2, FileClock, FileText, Files, Fingerprint, Flag, FlagTriangleRight, FlaskConical,
  Footprints, Gauge, GitBranch, GitCommitHorizontal, GitFork, GitPullRequest, Globe, GripVertical, HardDrive, Hash,
  HeartPulse, History, Hourglass, House, IdCard, Inbox, Key, KeyRound, Layers, Layers2, LayoutDashboard, LayoutGrid,
  List, ListChecks, Loader, LockKeyhole, LogOut, Logs, Maximize2, Medal, MessageSquareText, MessagesSquare, Mic,
  MicOff, Milestone, Monitor, Moon, MoreHorizontal, MoreVertical, MousePointerClick, Network, OctagonAlert, OctagonX,
  PanelsTopLeft, Pause, Pencil, Percent, PiggyBank, Play, PlugZap, Plus, Radio, Receipt, RefreshCw, Rocket,
  RotateCcw, RotateCw, Route, RouteOff, Rows3, Ruler, Scale, ScrollText, Search, Send, Server, Settings, Sheet,
  ShieldCheck, Shrink, Shuffle, Signpost, SkipBack, SkipForward, SlidersHorizontal, Snail, Sparkles, Split, Square,
  Star, Sun, TableProperties, Target, TestTube, Timer, TimerReset, Trash2, TrendingUp, TriangleAlert, Trophy,
  UserLock, Waypoints, WholeWord, Workflow, X, Zap,
} from 'lucide-react';

/**
 * Canonical field identities, reused wherever the same fact is displayed. OMN-21166 part 28a (Lakshman 2026-10-27, grey
 * icons with unique glyphs): every concept has its own glyph, so a concept stays unique by shape alone now that interface
 * icons are grey (OMN-21308 AC1); colour stays on the data.
 */
export const CONCEPT_ICONS: Readonly<Record<string, LucideIcon>> = {
  pass: CircleCheck, fail: CircleX, count: ListChecks, score: Star, threshold: Ruler,
  model: BrainCircuit, age: Clock3, identity: Fingerprint, duration: Timer,
  cost: CircleDollarSign, savings: PiggyBank, backend: Server, host: Monitor,
  // OMN-21970 AC8: tokens are words, not money, so they no longer share a coin glyph with spend.
  'tokens-in': ArrowDown, 'tokens-out': ArrowUp, tokens: WholeWord, basis: BadgeInfo,
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
  // OMN-21166 part 30 (revision 7): Runs' analysis views and its routing groups.
  'runs-analysis': PanelsTopLeft, 'run-routes': GitFork,
  // OMN-21970 AC8: the Runs cards' p95 duration and escalated runs have their own concepts, colours and glyphs.
  'duration-p95': Gauge, escalated: ChevronsUp,
};

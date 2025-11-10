/**
 * Standard Icon Vocabulary for Omnidash
 *
 * This file defines the canonical icon set used across all dashboards.
 * Import icons from this file instead of directly from lucide-react to ensure consistency.
 *
 * Color Convention:
 * - Green (status-healthy): Positive metrics, success, growth
 * - Yellow (status-warning): Warnings, degraded state, caution
 * - Red (status-error): Errors, failures, critical issues
 * - Blue (primary): Neutral metrics, information
 */

import {
  // Activity & Status Icons
  Activity,
  Zap,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Clock,

  // Infrastructure Icons
  Server,
  Database,
  Network,
  Globe,

  // Development Icons
  Code,
  FileCode,
  Cpu,
  Gauge,
  Shield,

  // User & Team Icons
  Users,
  Bot,

  // Quality & Performance Icons
  Award,
  Target,
  Search,

  // UI & Navigation Icons
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Download,
  X,
  Info,
  Eye,

  // Data Icons
  BarChart3,
  Layers,
  FileText,
  BookOpen,
  Calculator,

  // Messaging Icons
  MessageSquare,

  // Additional Icons
  Settings,
  Repeat,
  Star,
  Rocket,
  DollarSign,
  Check,
  Circle,
} from "lucide-react";

/**
 * Activity & Status Icons
 * Use these for representing active processes, status changes, and trends
 */
export const ACTIVITY_ICONS = {
  /** Active processes, running agents, live activity - shows movement/pulse */
  active: Activity,

  /** Speed, throughput, operations per second - shows lightning/energy */
  speed: Zap,

  /** Growth, trending up, new items today - shows upward trend */
  trending: TrendingUp,

  /** Success, completed tasks, passing quality gates - shows checkmark in circle */
  success: CheckCircle,

  /** Warnings, degraded state, attention needed - shows triangle with exclamation */
  warning: AlertTriangle,

  /** Errors, critical issues, failures - shows circle with X */
  error: AlertCircle,

  /** Time, duration, latency - shows clock face */
  time: Clock,
} as const;

/**
 * Infrastructure Icons
 * Use these for representing system components and services
 */
export const INFRASTRUCTURE_ICONS = {
  /** Server instances, microservices, backend services */
  server: Server,

  /** Database systems, storage, data persistence */
  database: Database,

  /** Network connections, relationships, graphs */
  network: Network,

  /** Web services, external APIs, internet connectivity */
  web: Globe,
} as const;

/**
 * Development Icons
 * Use these for code-related metrics and development activities
 */
export const DEVELOPMENT_ICONS = {
  /** Code files, development work, source code */
  code: Code,

  /** Individual code files, file analysis */
  codeFile: FileCode,

  /** Processing power, computational resources */
  cpu: Cpu,

  /** Performance metrics, complexity scores, measurements */
  gauge: Gauge,

  /** Security issues, compliance, protection */
  security: Shield,
} as const;

/**
 * Team Icons
 * Use these for representing users, agents, and team members
 */
export const TEAM_ICONS = {
  /** Human users, developers, team members */
  users: Users,

  /** AI agents, bots, automated processes */
  bot: Bot,
} as const;

/**
 * Quality & Performance Icons
 * Use these for quality metrics and achievements
 */
export const QUALITY_ICONS = {
  /** Quality scores, achievements, top patterns */
  award: Award,

  /** Targets, goals, thresholds */
  target: Target,

  /** Search functionality, queries, discovery */
  search: Search,
} as const;

/**
 * UI & Navigation Icons
 * Use these for user interface elements and navigation
 */
export const UI_ICONS = {
  /** Right chevron for navigation, expansion */
  chevronRight: ChevronRight,

  /** Down chevron for dropdowns, collapse */
  chevronDown: ChevronDown,

  /** Right arrow for flow, progression */
  arrowRight: ArrowRight,

  /** Left arrow for back navigation */
  arrowLeft: ArrowLeft,

  /** Download/export functionality */
  download: Download,

  /** Close, remove, delete actions */
  close: X,

  /** Information, help, details */
  info: Info,

  /** View, preview, visibility */
  view: Eye,
} as const;

/**
 * Data Visualization Icons
 * Use these for charts, analytics, and data representation
 */
export const DATA_ICONS = {
  /** Charts, analytics, metrics dashboards */
  analytics: BarChart3,

  /** Layers, hierarchies, stacked data */
  layers: Layers,

  /** Documents, files, text content */
  document: FileText,

  /** Documentation, guides, knowledge base */
  book: BookOpen,

  /** Calculations, computed metrics */
  calculator: Calculator,
} as const;

/**
 * Communication Icons
 * Use these for messaging and communication features
 */
export const COMMUNICATION_ICONS = {
  /** Chat, messaging, conversations */
  chat: MessageSquare,
} as const;

/**
 * Additional Icons
 * Miscellaneous icons for various use cases
 */
export const ADDITIONAL_ICONS = {
  /** Settings, configuration, preferences */
  settings: Settings,

  /** Repeat, retry, refresh actions */
  repeat: Repeat,

  /** Star rating, favorites, highlights */
  star: Star,

  /** Launch, fast start, acceleration */
  rocket: Rocket,

  /** Cost, savings, financial metrics */
  cost: DollarSign,

  /** Check without circle, simple confirmation */
  check: Check,

  /** Circle indicator, status dot */
  circle: Circle,
} as const;

/**
 * Consolidated Icon Export
 * Import from this object for type safety and IDE autocomplete
 */
export const STANDARD_ICONS = {
  ...ACTIVITY_ICONS,
  ...INFRASTRUCTURE_ICONS,
  ...DEVELOPMENT_ICONS,
  ...TEAM_ICONS,
  ...QUALITY_ICONS,
  ...UI_ICONS,
  ...DATA_ICONS,
  ...COMMUNICATION_ICONS,
  ...ADDITIONAL_ICONS,
} as const;

/**
 * Type for all available standard icons
 */
export type StandardIconKey = keyof typeof STANDARD_ICONS;

/**
 * Icon Usage Guidelines
 * ======================
 *
 * Semantic Meaning:
 * -----------------
 * - Use icons consistently to represent the same concept across all dashboards
 * - Choose icons based on semantic meaning, not just visual appearance
 * - When in doubt, check existing usage in similar dashboards
 *
 * Color Conventions:
 * ------------------
 * - Green (status-healthy): Success, growth, positive trends, healthy systems
 * - Yellow (status-warning): Warnings, degraded performance, attention needed
 * - Red (status-error): Errors, failures, critical issues, down services
 * - Blue (primary): Neutral information, general metrics
 *
 * MetricCard Usage:
 * -----------------
 * - Import icons from STANDARD_ICONS instead of lucide-react
 * - Pass the icon component to the `icon` prop
 * - Set appropriate `status` prop for color coding
 *
 * Example:
 * ```tsx
 * import { STANDARD_ICONS } from "@/lib/standardIcons";
 *
 * <MetricCard
 *   label="Active Agents"
 *   value={42}
 *   icon={STANDARD_ICONS.active}
 *   status="healthy"
 * />
 * ```
 *
 * Common Patterns:
 * ----------------
 * - "New Today" / Growth metrics: Use `trending` icon with green color
 * - "Active" / "Running" status: Use `active` icon with blue or green
 * - Success rates: Use `success` icon with green color
 * - Error counts: Use `error` or `warning` icon with red/yellow color
 * - Time/latency metrics: Use `time` icon
 * - Throughput/speed: Use `speed` icon
 * - Database operations: Use `database` icon
 * - Code analysis: Use `code` or `codeFile` icon
 *
 * Adding New Icons:
 * -----------------
 * 1. Import the icon from lucide-react at the top of this file
 * 2. Add it to the appropriate category object
 * 3. Add JSDoc comment explaining when to use it
 * 4. Update the STANDARD_ICONS consolidation
 * 5. Document the usage in this comment block
 */

/**
 * Helper function to get icon by key with type safety
 */
export function getStandardIcon(key: StandardIconKey) {
  return STANDARD_ICONS[key];
}

/**
 * Default export for convenience
 */
export default STANDARD_ICONS;

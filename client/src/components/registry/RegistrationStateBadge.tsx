/**
 * RegistrationStateBadge
 *
 * Renders a colored Badge with a tooltip for any node registration state.
 * Handles both UPPERCASE (registry-types.ts) and lowercase (projection-types.ts)
 * variants by normalizing to lowercase before lookup.
 *
 * Exports helper functions `getStateColor` and `humanizeState` so other
 * components (tables, charts, legends) can reuse the color/label mapping
 * without importing the full React component.
 *
 * @see shared/projection-types.ts  — RegistrationState (lowercase canonical)
 * @see shared/registry-types.ts    — RegistrationState (UPPERCASE legacy)
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// State configuration
// ---------------------------------------------------------------------------

interface StateConfig {
  /** Tailwind classes applied to the Badge */
  color: string;
  /** Human-readable label */
  label: string;
  /** Tooltip description */
  tooltip: string;
}

/**
 * Complete mapping of lowercase registration states to display configuration.
 *
 * Color groups:
 *  - Amber/yellow : pending / transitional states (waiting for progress)
 *  - Blue/cyan    : acknowledgment received (positive transition in progress)
 *  - Green        : active (healthy, sending heartbeats)
 *  - Red          : failure states (rejected, timed out, expired)
 *  - Gray         : unknown / unrecognized fallback
 */
const STATE_CONFIG: Record<string, StateConfig> = {
  pending_registration: {
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    label: 'Pending Registration',
    tooltip: 'Node has announced itself and is awaiting acceptance',
  },
  accepted: {
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    label: 'Accepted',
    tooltip: 'Registry accepted the node, awaiting acknowledgment',
  },
  awaiting_ack: {
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    label: 'Awaiting ACK',
    tooltip: 'Node acknowledgment requested, waiting for response',
  },
  ack_received: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'ACK Received',
    tooltip: 'Acknowledgment received, activating node',
  },
  active: {
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    label: 'Active',
    tooltip: 'Node is active and sending heartbeats',
  },
  rejected: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Rejected',
    tooltip: 'Registry rejected the node registration',
  },
  ack_timed_out: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'ACK Timed Out',
    tooltip: 'Node failed to acknowledge within timeout period',
  },
  liveness_expired: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Liveness Expired',
    tooltip: 'Node stopped sending heartbeats',
  },
};

const DEFAULT_CONFIG: StateConfig = {
  color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  label: 'Unknown',
  tooltip: 'Unrecognized registration state',
};

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/** Normalize any casing to the lowercase key used in STATE_CONFIG. */
function normalize(state: string): string {
  return state.toLowerCase();
}

/**
 * Returns the Tailwind color classes for a given registration state.
 * Accepts both UPPERCASE and lowercase variants.
 */
export function getStateColor(state: string): string {
  return (STATE_CONFIG[normalize(state)] ?? DEFAULT_CONFIG).color;
}

/**
 * Returns the human-readable display label for a given registration state.
 * Accepts both UPPERCASE and lowercase variants.
 */
export function humanizeState(state: string): string {
  return (STATE_CONFIG[normalize(state)] ?? DEFAULT_CONFIG).label;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RegistrationStateBadgeProps {
  /** Registration state string (UPPERCASE or lowercase accepted). */
  state: string;
  /** Additional Tailwind classes forwarded to the Badge root. */
  className?: string;
}

/**
 * A colored badge with tooltip that visualizes a node's registration state.
 *
 * Usage:
 * ```tsx
 * <RegistrationStateBadge state="pending_registration" />
 * <RegistrationStateBadge state="ACTIVE" />
 * ```
 */
export function RegistrationStateBadge({ state, className }: RegistrationStateBadgeProps) {
  const config = STATE_CONFIG[normalize(state)] ?? DEFAULT_CONFIG;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn(config.color, 'cursor-help', className)}>
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <p className="text-xs">{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

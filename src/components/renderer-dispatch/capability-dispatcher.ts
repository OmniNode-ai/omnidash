// Contract-driven renderer dispatcher (OMN-13131, W4).
//
// Generalizes the OMN-10282 `resolveChartAdapter` (which keyed on an ad-hoc
// (adapterKey, implementationKey) pair) into a single dispatcher driven by the
// canonical `RendererCapabilityContract`. Capabilities DRIVE dispatch: a
// requirement (component kind + advertised capability flags + interaction model
// + minimum accessibility tier) selects the renderer whose advertised capability
// surface satisfies it. `resolveChartAdapter` is subsumed — a (kind, capability)
// requirement resolves the concrete adapter without any bespoke key.
//
// Doctrine: the client renders truth, it does not create it. This module only
// matches an incoming capability requirement against renderer-advertised
// capability contracts; it performs no I/O and reads no authoritative state.

import type {
  RendererCapabilityContract,
  WidgetKind,
  RendererInteractionModel,
  AccessibilityTier,
} from '@shared/types/renderer-capability';

/**
 * The granular `supports_*` capability flags a requirement may demand. Mirrors
 * the optional boolean fields on `RendererCapabilityContract`; restricted to the
 * subset of keys whose value is `boolean | undefined` so indexing stays sound.
 */
export type SupportsFlag = Extract<
  {
    [K in keyof RendererCapabilityContract]-?: RendererCapabilityContract[K] extends
      | boolean
      | undefined
      ? K
      : never;
  }[keyof RendererCapabilityContract],
  `supports_${string}`
>;

/**
 * What a contract requires of a renderer. Dispatch is keyed on this — never on
 * ad-hoc metadata flags carried beside the contract.
 */
export interface RendererRequirement {
  /** The component kind that must be renderable (mirror of EnumWidgetType). */
  componentKind: WidgetKind;
  /** Granular `supports_*` flags the renderer must advertise as `true`. */
  requiredCapabilities?: readonly SupportsFlag[];
  /** Exact interaction model the renderer must advertise, when constrained. */
  interactionModel?: RendererInteractionModel;
  /** Minimum WCAG-aligned accessibility tier the renderer must guarantee. */
  minAccessibilityTier?: AccessibilityTier;
}

/** A registered renderer: its advertised capability surface plus its adapter. */
export interface RendererEntry<TAdapter> {
  capability: RendererCapabilityContract;
  adapter: TAdapter;
}

/** Outcome of a dispatch: a matched entry, or a typed miss with a reason. */
export type DispatchResult<TAdapter> =
  | { matched: true; entry: RendererEntry<TAdapter> }
  | { matched: false; reason: string };

// Ordinal ranking for accessibility tiers so `minAccessibilityTier` can compare
// "at least this good" rather than exact equality. Higher number = stronger
// guarantee (aaa > aa > a).
const ACCESSIBILITY_RANK: Record<AccessibilityTier, number> = {
  a: 1,
  aa: 2,
  aaa: 3,
};

/**
 * Pure predicate: does a renderer's advertised capability surface satisfy a
 * requirement? No I/O, no side effects — deterministic capability matching.
 */
export function capabilitySatisfies(
  capability: RendererCapabilityContract,
  requirement: RendererRequirement,
): boolean {
  if (!capability.supported_component_kinds.includes(requirement.componentKind)) {
    return false;
  }

  if (requirement.requiredCapabilities) {
    for (const flag of requirement.requiredCapabilities) {
      if (capability[flag] !== true) {
        return false;
      }
    }
  }

  if (
    requirement.interactionModel !== undefined &&
    capability.interaction_model !== requirement.interactionModel
  ) {
    return false;
  }

  if (
    requirement.minAccessibilityTier !== undefined &&
    ACCESSIBILITY_RANK[capability.accessibility_tier] <
      ACCESSIBILITY_RANK[requirement.minAccessibilityTier]
  ) {
    return false;
  }

  return true;
}

/**
 * Builds a human-readable miss reason describing which part of the requirement
 * went unsatisfied. Used only on the no-match path — dispatch never throws on a
 * miss (an absent capability is handled, not a crash).
 */
function describeMiss(requirement: RendererRequirement): string {
  const parts: string[] = [`component kind "${requirement.componentKind}"`];
  if (requirement.requiredCapabilities?.length) {
    parts.push(`capabilities [${requirement.requiredCapabilities.join(', ')}]`);
  }
  if (requirement.interactionModel !== undefined) {
    parts.push(`interaction model "${requirement.interactionModel}"`);
  }
  if (requirement.minAccessibilityTier !== undefined) {
    parts.push(`minimum accessibility tier "${requirement.minAccessibilityTier}"`);
  }
  return `No registered renderer satisfies requirement: ${parts.join(', ')}.`;
}

/**
 * Capability-driven renderer dispatcher. Registers renderer entries (each a
 * capability contract + a concrete adapter) and resolves a requirement to the
 * first entry whose advertised capability surface satisfies it.
 *
 * Subsumes `resolveChartAdapter`: rather than resolving on an
 * (adapterKey, implementationKey) pair, the dispatcher resolves on the renderer
 * capability surface itself, so capability negotiation drives selection.
 */
export class CapabilityDispatcher<TAdapter> {
  private readonly entries: readonly RendererEntry<TAdapter>[];

  constructor(entries: readonly RendererEntry<TAdapter>[]) {
    this.entries = entries;
  }

  /**
   * Resolve a requirement to a renderer. Returns a typed match or a typed miss;
   * never throws on a no-match — the caller renders an empty/unsupported state.
   * Selection is deterministic: the first registered entry that satisfies the
   * requirement wins.
   */
  dispatch(requirement: RendererRequirement): DispatchResult<TAdapter> {
    for (const entry of this.entries) {
      if (capabilitySatisfies(entry.capability, requirement)) {
        return { matched: true, entry };
      }
    }
    return { matched: false, reason: describeMiss(requirement) };
  }

  /** All capability surfaces this dispatcher can resolve (for introspection). */
  capabilities(): readonly RendererCapabilityContract[] {
    return this.entries.map((entry) => entry.capability);
  }
}

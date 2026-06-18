/**
 * OMN-13131 (W-cap): the omnidash WEB renderer's advertised capability surface.
 *
 * This is the single declared source of truth for *what the omnidash web
 * renderer can render*, expressed as a `RendererCapabilityContract`. The
 * server-side capability-heartbeat producer (server/renderer-capability-producer.ts)
 * publishes this surface (wrapped in a declaration envelope) onto
 * `RENDERER_CAPABILITY_DECLARED_TOPIC` on startup and on a periodic heartbeat;
 * the W5 reducer (`node_renderer_capability_projection`) folds it into the
 * Renderer Capability Registry projection.
 *
 * `supported_component_kinds` is NOT a hand-picked guess: it is the distinct set
 * of component kinds the W4 capability-driven dispatcher's registered adapters
 * advertise. The chart adapter registry (src/components/charts/adapter-resolver.ts)
 * registers `chart`, `metric_card`, and `table`; the visualization registry
 * (src/components/dashboard/projection-container/viz-registry.ts) registers the
 * same three. The web renderer therefore declares exactly those kinds. The
 * src-side test src/components/renderer-dispatch/__tests__/web-renderer-capability.test.ts
 * anchors this set to those registries (and asserts the surface is assignable to
 * the canonical `RendererCapabilityContract`) so the declaration cannot silently
 * drift from the kinds the dispatcher can actually resolve.
 *
 * Lives in `shared/` and is part of the server (tsconfig.node) project — NOT the
 * browser tsconfig — so it must stay dependency-free and structurally
 * self-contained (no import of the generated onex-models, which the main project
 * owns). The local `WebRendererCapability` interface mirrors the canonical Python
 * `ModelRendererCapabilityContract` field-for-field; the src-side test proves the
 * two stay compatible.
 */

/** Component-kind vocabulary mirror of the shipped `EnumWidgetType`. */
export type WebWidgetKind =
  | 'chart'
  | 'table'
  | 'metric_card'
  | 'status_grid'
  | 'event_feed';

/** Interaction model mirror of the shipped `EnumRendererInteractionModel`. */
export type WebInteractionModel = 'pointer' | 'touch' | 'keyboard' | 'voice';

/** Accessibility tier mirror of the shipped `EnumAccessibilityTier`. */
export type WebAccessibilityTier = 'a' | 'aa' | 'aaa';

/** Structured semantic version mirror of the shipped `ModelSemVer`. */
export interface WebContractVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Structural mirror of the canonical `RendererCapabilityContract`
 * (omnibase_core ModelRendererCapabilityContract). Field-for-field assignable to
 * the generated type — proven by the src-side compatibility test.
 */
export interface WebRendererCapability {
  renderer_id: string;
  platform: string;
  supported_component_kinds: WebWidgetKind[];
  interaction_model: WebInteractionModel;
  accessibility_tier: WebAccessibilityTier;
  contract_version: WebContractVersion;
  supports_interaction?: boolean;
  supports_streaming?: boolean;
  supports_theming?: boolean;
}

/** Stable identifier for the omnidash web renderer (mirrors DEFAULT_RENDERER_ID). */
export const WEB_RENDERER_ID = 'omnidash-web';

/** Target platform the omnidash renderer runs on. */
export const WEB_RENDERER_PLATFORM = 'web';

/** Interaction model the web renderer advertises (pointer-driven UI). */
export const WEB_RENDERER_INTERACTION_MODEL: WebInteractionModel = 'pointer';

/** WCAG-aligned accessibility tier the web renderer guarantees. */
export const WEB_RENDERER_ACCESSIBILITY_TIER: WebAccessibilityTier = 'aa';

/**
 * Component kinds the web renderer can render. These are the distinct
 * `componentKind` values the W4 dispatcher's chart + visualization adapter
 * registries advertise — NOT a free-form list. Anchored by the src-side test.
 */
export const WEB_RENDERER_SUPPORTED_COMPONENT_KINDS: readonly WebWidgetKind[] = [
  'chart',
  'table',
  'metric_card',
] as const;

/**
 * The web renderer's advertised capability surface. The `contract_version`
 * tracks the capability-contract schema this declaration was authored against;
 * the W5 projection records it per renderer so schema drift is observable.
 */
export function webRendererCapability(): WebRendererCapability {
  return {
    renderer_id: WEB_RENDERER_ID,
    platform: WEB_RENDERER_PLATFORM,
    supported_component_kinds: [...WEB_RENDERER_SUPPORTED_COMPONENT_KINDS],
    interaction_model: WEB_RENDERER_INTERACTION_MODEL,
    accessibility_tier: WEB_RENDERER_ACCESSIBILITY_TIER,
    contract_version: { major: 1, minor: 0, patch: 0 },
    supports_interaction: true,
    supports_streaming: false,
    supports_theming: true,
  };
}

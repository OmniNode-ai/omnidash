// Boundary types for the contract-driven renderer dispatcher (OMN-13131, W4).
//
// These re-export the generated TypeScript mirror of the Python Pydantic model
// `ModelRendererCapabilityContract` (omnibase_core
// src/omnibase_core/models/dashboard/model_renderer_capability_contract.py).
// The generated source of truth is `src/shared/types/generated/onex-models.ts`,
// regenerated via `npm run types:generate`. This module is the hand-maintained
// boundary barrel — mirroring the `chart-adapter.ts` convention — so consumers
// import stable, well-named symbols rather than the json2ts-suffixed forms
// (e.g. `EnumWidgetType1`).
//
// Do NOT widen or reshape these types here. If the Python model changes,
// regenerate the mirror and adjust the re-exports — never hand-author fields.

import type {
  ModelRendererCapabilityContract as GeneratedRendererCapabilityContract,
  EnumWidgetType,
  EnumRendererInteractionModel,
  EnumAccessibilityTier,
} from '../../src/shared/types/generated/onex-models';

/**
 * A renderer's advertised capability surface — the TypeScript mirror of the
 * canonical Python `ModelRendererCapabilityContract`. Capabilities, not ad-hoc
 * metadata flags, drive renderer/adapter dispatch.
 */
export type RendererCapabilityContract = GeneratedRendererCapabilityContract;

/**
 * Component kind vocabulary (mirror of the shipped Python `EnumWidgetType`).
 * Capability negotiation is anchored on the component kinds that already exist.
 */
export type WidgetKind = EnumWidgetType;

/** Interaction model a renderer advertises (mirror of Python enum). */
export type RendererInteractionModel = EnumRendererInteractionModel;

/** WCAG-aligned accessibility tier a renderer guarantees (mirror of Python enum). */
export type AccessibilityTier = EnumAccessibilityTier;

/**
 * Descriptor for the renderer-capability projection (OMN-13131, W5/W6).
 *
 * The W5 reducer materializes declared renderer capabilities (heartbeat-TTL
 * freshness → `is_degraded`) onto this projection topic; omnidash reads it via
 * the existing `/projection/{topic}` poll path (`useProjectionQuery`). The topic
 * is a DECLARED field of this descriptor — mirroring the `VisualizationContract`
 * convention where the projection topic is a contract field, not an inline string
 * literal scattered through dispatch/handler code paths.
 */
export const RENDERER_CAPABILITY_PROJECTION = {
  /**
   * Snapshot projection topic the W5 reducer writes renderer-capability rows to.
   * Suffix mirrors the registered command topic
   * `onex.cmd.ui.renderer-capability-declared.v1` (validate_topic_suffix-checked
   * upstream). Declared once here so the read path references a symbol.
   */
  topic: 'onex.snapshot.projection.ui.renderer-capability.v1',
  displayName: 'Renderer Capabilities',
} as const;

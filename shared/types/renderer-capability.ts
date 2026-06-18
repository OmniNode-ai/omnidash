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

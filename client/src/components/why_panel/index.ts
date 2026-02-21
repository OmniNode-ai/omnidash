/**
 * why_panel — "Why This Happened" panel components (OMN-2350 epic)
 *
 * Four views into system decision provenance:
 *   View 1: IntentVsPlan     — side-by-side intent vs resolved plan (OMN-2468)
 *   View 2: DecisionTimeline — chronological DecisionRecord sequence (OMN-2469)
 *   View 3: CandidateComparison — full candidate evaluation table (OMN-2470)
 *   View 4: NarrativeOverlay — Layer 1 vs Layer 2 visual distinction (OMN-2471)
 */

export { IntentVsPlan } from './IntentVsPlan';
export type { IntentVsPlanProps } from './IntentVsPlan';

export { DecisionTimeline } from './DecisionTimeline';
export type { DecisionTimelineProps } from './DecisionTimeline';

export { CandidateComparison } from './CandidateComparison';
export type { CandidateComparisonProps } from './CandidateComparison';

export { NarrativeOverlay } from './NarrativeOverlay';
export type { NarrativeOverlayProps } from './NarrativeOverlay';

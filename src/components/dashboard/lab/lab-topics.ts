import { TOPICS } from '@shared/types/topics';

/** Live sources reported by the .201 lane health census for OMN-18772. */
export const LAB_BUS_BACKED_TOPICS = new Set<string>([
  TOPICS.consumerFlow,
  TOPICS.costSavingsOverview,
  TOPICS.delegationDecisions,
  TOPICS.delegationModelRouting,
  TOPICS.delegationQualityGate,
  TOPICS.delegationSavings,
  TOPICS.delegationSummary,
  TOPICS.delegationTokenUsage,
  'onex.snapshot.projection.lab.lane-health.v1',
  TOPICS.liveEvents,
  'onex.snapshot.projection.prod-promotion-gate.v1',
  TOPICS.registration,
  'onex.snapshot.projection.runner-fleet.v1',
  TOPICS.runtimeErrorFingerprints,
  TOPICS.sessionReplay,
  'onex.snapshot.projection.tenant-credentials.v1',
  TOPICS.workEvents,
]);

export const EVENT_TRACE_TOPICS = [
  TOPICS.liveEvents,
  TOPICS.delegationDecisions,
  TOPICS.workEvents,
] as const;

export const ERROR_WIDGET_TOPICS = [
  TOPICS.consumerFlow,
  TOPICS.liveEvents,
  TOPICS.runtimeErrorFingerprints,
] as const;

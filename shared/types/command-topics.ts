/**
 * OMN-12149: Command topic registry — omnidash → ONEX runtime dispatch.
 *
 * Naming convention: `onex.cmd.{service}.{event}.v{N}`.
 * Kept separate from topics.ts so the golden-chain gate
 * (onex.snapshot.projection.* invariant on TOPICS) continues to hold.
 */
export const COMMAND_TOPICS = {
  /** OMN-12145: generic command dispatch envelope published by the Express bridge. */
  dispatchRequest: 'onex.cmd.omnimarket.dispatch-request.v1',
} as const;

export type CommandTopicSymbol = (typeof COMMAND_TOPICS)[keyof typeof COMMAND_TOPICS];

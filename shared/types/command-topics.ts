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
  /** OMN-12070: delegation command dispatched to the omnimarket delegation skill node. */
  delegateSkill: 'onex.cmd.omnimarket.delegate-skill.v1',
  /**
   * OMN-12775: SEA node-generation command consumed by node_generation_consumer.
   * Contract: omnimarket/src/omnimarket/nodes/node_generation_consumer/contract.yaml
   * subscribe_topics: [onex.cmd.omnimarket.node-generation-requested.v1]
   */
  nodeGenerationRequested: 'onex.cmd.omnimarket.node-generation-requested.v1',
} as const;

export type CommandTopicSymbol = (typeof COMMAND_TOPICS)[keyof typeof COMMAND_TOPICS];

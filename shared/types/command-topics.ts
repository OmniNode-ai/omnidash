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
  /**
   * OMN-13131 (W2): the canonical bus-native command emitted by the web
   * renderer for every UI action. The renderer thin-publishes the action's
   * command envelope onto this declared topic; a downstream capability-driven
   * dispatcher (W4) consumes it and routes to the business workflow. The
   * renderer producer never chooses the workflow itself — it carries only the
   * action_contract_id + payload it received. Topic suffix follows the
   * `onex.cmd.{service}.{event}.v{N}` convention.
   */
  rendererAction: 'onex.cmd.omnidash.renderer-action.v1',
} as const;

export type CommandTopicSymbol = (typeof COMMAND_TOPICS)[keyof typeof COMMAND_TOPICS];

/**
 * OMN-13131 (G-E): the single declared topic the renderer thin-producer is
 * permitted to publish to. The emitter derives its target topic from this
 * constant — no `onex.cmd.*` string literal appears in the action path. Any
 * attempt to publish to a different topic is rejected by the producer-bounds
 * guard so the renderer cannot fan a command out onto an arbitrary topic.
 */
export const RENDERER_ACTION_TOPIC = COMMAND_TOPICS.rendererAction;

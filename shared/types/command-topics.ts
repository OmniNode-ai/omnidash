/**
 * OMN-12149: Command topic registry — omnidash → ONEX runtime dispatch.
 *
 * Naming convention: `onex.cmd.{service}.{event}.v{N}`.
 * Kept separate from topics.ts so the golden-chain gate
 * (onex.snapshot.projection.* invariant on TOPICS) continues to hold.
 */
export const COMMAND_TOPICS = {
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
  /**
   * OMN-13131 (W-cap): the canonical capability-heartbeat command the web
   * renderer thin-publishes on startup and on a periodic interval. The W5
   * reducer (node_renderer_capability_projection) consumes this topic and folds
   * each declaration into the heartbeat-backed Renderer Capability Registry
   * projection; a heartbeat that lapses past the reducer's TTL flips the row to
   * `is_degraded`. The literal mirrors the canonical constant
   * `RENDERER_CAPABILITY_DECLARED_TOPIC_V1` in `omnimarket.events.topics` (the
   * reducer contract's `subscribe_topics` entry) — declared once here so the
   * capability-producer emit path references a symbol, never an inline literal
   * (G-E). Topic suffix follows the `onex.cmd.{service}.{event}.v{N}` convention
   * (service `ui` = the declaring renderer producer).
   */
  rendererCapabilityDeclared: 'onex.cmd.ui.renderer-capability-declared.v1',
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

/**
 * OMN-13131 (W-cap / G-E): the single declared topic the renderer
 * capability-heartbeat producer is permitted to publish to. The producer
 * derives its target topic from this constant — no
 * `onex.cmd.ui.renderer-capability-declared.v1` string literal appears in the
 * capability-emit path. The W5 reducer's `subscribe_topics` consumes the same
 * topic; declaring it here keeps producer and consumer anchored on one symbol.
 */
export const RENDERER_CAPABILITY_DECLARED_TOPIC =
  COMMAND_TOPICS.rendererCapabilityDeclared;

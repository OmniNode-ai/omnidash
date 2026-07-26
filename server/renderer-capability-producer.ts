/**
 * OMN-13131 (W-cap): renderer capability-heartbeat producer (the PRODUCER half
 * of the Renderer Capability Registry loop).
 *
 * The omnidash Express server declares the web renderer's capability surface
 * through the generic runtime edge. On startup and on a configurable heartbeat
 * interval, the server dispatches a
 * `ModelRendererCapabilityDeclaration`-shaped payload ({ capability, declared_at })
 * onto `RENDERER_CAPABILITY_DECLARED_TOPIC`. The W5 reducer
 * (node_renderer_capability_projection) folds each declaration into the
 * heartbeat-backed projection; when the heartbeat lapses past the reducer's TTL,
 * the row flips to is_degraded.
 *
 * G-D thin-producer bounds (mechanically tested in
 * server/__tests__/renderer-capability-producer.test.ts):
 *   MAY     — validate the capability surface shape, attach identity + transport
 *             metadata, publish VERBATIM to the one declared topic, and re-emit
 *             on a fixed interval.
 *   MAY NOT — derive projection freshness (is_degraded / last_heartbeat /
 *             observed_at / empty_state_reason), name a downstream reducer/node,
 *             rewrite the capability surface, or branch on its contents. The W5
 *             reducer owns freshness; this module is transport-only.
 */
import { randomUUID } from 'node:crypto';
import { RENDERER_CAPABILITY_DECLARED_TOPIC } from '../shared/types/command-topics.js';
import type { WebRendererCapability } from '../shared/types/web-renderer-capability.js';

/** RFC-4122 UUID matcher used to validate a caller-supplied correlation id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Stable identifier for this producer, recorded in transport metadata. */
const PRODUCER_ID = 'omnidash-renderer-capability-producer';

/** Raised when a declaration is structurally invalid. Fail-fast, no silent drop. */
export class CapabilityProducerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityProducerError';
  }
}

/** Input for one capability declaration: the surface to advertise, plus identity. */
export interface CapabilityDeclarationInput {
  /** The renderer's advertised capability surface (the core primitive). */
  capability: WebRendererCapability;
  /** Optional correlation id; minted when absent so every declaration has one. */
  correlationId?: string;
}

/** Transport metadata attached by the thin producer (not business truth). */
export interface CapabilityDeclarationTransport {
  kind: 'thin-publish';
  producer: typeof PRODUCER_ID;
  topic: typeof RENDERER_CAPABILITY_DECLARED_TOPIC;
}

/**
 * The declaration payload the W5 reducer consumes. Mirrors the Python
 * `ModelRendererCapabilityDeclaration`: the advertised capability surface plus
 * the heartbeat instant. The reducer keys on `capability.renderer_id` and uses
 * `declared_at` as the freshness anchor.
 */
export interface CapabilityDeclarationPayload {
  capability: WebRendererCapability;
  declared_at: string;
}

/** The identity-bearing envelope published to the bus. */
export interface CapabilityDeclarationEnvelope {
  envelope_id: string;
  envelope_timestamp: string;
  correlation_id: string;
  source_tool: 'omnidash-ui';
  payload: CapabilityDeclarationPayload;
  transport: CapabilityDeclarationTransport;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CapabilityProducerError(`${field} is required`);
  }
  return value;
}

/**
 * Validate the advertised capability surface (shape only — no business logic).
 * Fail-fast: an invalid declaration must never silently publish a malformed row
 * the reducer would then materialize.
 */
function validateCapability(capability: WebRendererCapability): void {
  if (typeof capability !== 'object' || capability === null) {
    throw new CapabilityProducerError('capability is required and must be an object');
  }
  requireNonEmpty(capability.renderer_id, 'capability.renderer_id');
  requireNonEmpty(capability.platform, 'capability.platform');
  if (
    !Array.isArray(capability.supported_component_kinds) ||
    capability.supported_component_kinds.length === 0
  ) {
    throw new CapabilityProducerError(
      'capability.supported_component_kinds must be a non-empty array',
    );
  }
}

/**
 * Build the identity-bearing capability declaration envelope. Pure and
 * deterministic apart from the minted ids/timestamps: it validates the surface,
 * attaches identity + transport metadata, and carries the capability verbatim.
 * It does NOT derive projection freshness or reshape the surface.
 */
export function buildCapabilityDeclarationEnvelope(
  input: CapabilityDeclarationInput,
): CapabilityDeclarationEnvelope {
  validateCapability(input.capability);

  let correlationId: string;
  if (input.correlationId === undefined) {
    correlationId = randomUUID();
  } else {
    if (!UUID_RE.test(input.correlationId)) {
      throw new CapabilityProducerError('correlation_id must be a UUID when supplied');
    }
    correlationId = input.correlationId;
  }

  const now = new Date().toISOString();
  return {
    envelope_id: randomUUID(),
    envelope_timestamp: now,
    correlation_id: correlationId,
    source_tool: 'omnidash-ui',
    payload: {
      capability: input.capability,
      declared_at: now,
    },
    transport: {
      kind: 'thin-publish',
      producer: PRODUCER_ID,
      topic: RENDERER_CAPABILITY_DECLARED_TOPIC,
    },
  };
}

/** Runtime-dispatch seam — injectable so tests never need a live runtime. */
export interface CapabilityProducerDeps {
  publish?: (topic: string, value: unknown) => Promise<void>;
}

/**
 * Build one capability declaration, then hand it to the runtime-dispatch seam.
 * Returns the emitted envelope.
 */
export async function emitCapabilityDeclaration(
  input: CapabilityDeclarationInput,
  deps: CapabilityProducerDeps = {},
): Promise<CapabilityDeclarationEnvelope> {
  const publish = deps.publish;
  if (!publish) {
    throw new CapabilityProducerError('runtime edge publisher is required');
  }
  const envelope = buildCapabilityDeclarationEnvelope(input);
  await publish(RENDERER_CAPABILITY_DECLARED_TOPIC, envelope);
  return envelope;
}

/** A running heartbeat — call `stop()` to cancel the interval. */
export interface CapabilityHeartbeatHandle {
  stop(): void;
}

/** Options for the capability heartbeat scheduler. */
export interface CapabilityHeartbeatOptions {
  /** Re-publish interval in milliseconds. Must be positive. */
  intervalMs: number;
  /** The declaration to (re-)emit each tick. */
  input: CapabilityDeclarationInput;
  /** Producer seam (injectable for tests). */
  deps?: CapabilityProducerDeps;
  /**
   * Called when a heartbeat publish rejects. The scheduler keeps running so a
   * transient runtime-edge failure does not permanently silence the heartbeat (which
   * would otherwise let the W5 row drift to is_degraded). Defaults to a warn log.
   */
  onError?: (err: unknown) => void;
}

/**
 * Start the capability heartbeat: publish once immediately, then re-publish on
 * `intervalMs` so the W5 projection's `last_heartbeat` stays fresh. A failed
 * publish is reported via `onError` but does not stop the loop. Each tick mints
 * a fresh `declared_at` (built inside `emitCapabilityDeclaration`), so the
 * reducer sees a monotonically advancing heartbeat instant.
 */
export function startCapabilityHeartbeat(
  options: CapabilityHeartbeatOptions,
): CapabilityHeartbeatHandle {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new CapabilityProducerError('intervalMs must be a positive number');
  }
  // Validate the surface up front so a misconfigured heartbeat fails on start,
  // not silently on every tick.
  validateCapability(options.input.capability);

  const onError =
    options.onError ??
    ((err: unknown) => {
      console.warn('[omnidash server] capability heartbeat publish failed:', err);
    });

  const tick = (): void => {
    void emitCapabilityDeclaration(options.input, options.deps).catch(onError);
  };

  tick();
  const timer = setInterval(tick, options.intervalMs);
  // Do not keep the Node event loop alive solely for the heartbeat.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}

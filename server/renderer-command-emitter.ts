/**
 * OMN-13131 (W2): renderer command envelope builder.
 *
 * The renderer hands over the action's contract id + payload and this module
 * builds the identity-bearing envelope. OmniDash has no production broker
 * client; a contract-declared runtime dispatcher must provide the transport
 * seam before an action may be accepted.
 *
 * G-D thin-producer bounds (mechanically tested in
 * server/__tests__/renderer-command-emitter.test.ts):
 *   MAY     — validate envelope shape, attach transport metadata, publish to
 *             the DECLARED topic.
 *   MAY NOT — choose a business workflow, rewrite intent, mutate payload
 *             semantics, branch on the action contract id, or contain any
 *             renderer-capability logic. The capability-driven dispatcher (W4)
 *             owns routing; this module is transport-only.
 *
 * Read path (/projection polling) is unchanged. This adds the write path only.
 */
import { randomUUID } from 'node:crypto';
import { RENDERER_ACTION_TOPIC } from '../shared/types/command-topics.js';

/** RFC-4122 UUID matcher used to validate caller-supplied identity fields. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Stable identifier for this producer, recorded in transport metadata. */
const PRODUCER_ID = 'omnidash-renderer-command-emitter';

/** Raised when an emission is structurally invalid. Fail-fast, no silent drop. */
export class RendererEmitterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RendererEmitterError';
  }
}

/** Tenant identity derived from the verified Keycloak JWT at server ingress. */
export interface RendererTenantContext {
  tenant_id: string;
  tenant_slug: string;
  sub: string;
}

/**
 * The renderer-supplied description of a single UI action. The renderer owns
 * the action contract id + payload; identity (correlation/causation) is passed
 * through when the action follows a prior projection/event.
 */
export interface RendererCommandInput {
  /** The renderer instance that produced the action (e.g. 'omnidash-web'). */
  rendererId: string;
  /** The action contract this emission satisfies (e.g. 'delegation.trigger.v1'). */
  actionContractId: string;
  /** The contract version the renderer rendered against (e.g. 'v1'). */
  contractVersion: string;
  /** Optional correlation id; minted when absent so every emission has one. */
  correlationId?: string;
  /** Required when the action follows a prior projection/event; else absent. */
  causationId?: string;
  /** The action payload, carried verbatim. Must be a keyed object. */
  payload: Record<string, unknown>;
  /** Tenant identity from the verified JWT — attached once at ingress, never from body. */
  tenantContext?: RendererTenantContext;
}

/** Transport metadata attached by the thin producer (not business truth). */
export interface RendererCommandTransport {
  kind: 'thin-publish';
  producer: typeof PRODUCER_ID;
  topic: typeof RENDERER_ACTION_TOPIC;
}

/**
 * The canonical command envelope published to the bus. Identity fields are
 * mandatory; there is intentionally NO workflow/target-node/handler/route field
 * — selecting downstream business behavior is the dispatcher's job, not the
 * renderer's.
 */
export interface RendererCommandEnvelope {
  envelope_id: string;
  envelope_timestamp: string;
  correlation_id: string;
  causation_id: string | null;
  renderer_id: string;
  action_contract_id: string;
  contract_version: string;
  source_tool: 'omnidash-ui';
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_sub: string | null;
  payload: Record<string, unknown>;
  transport: RendererCommandTransport;
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RendererEmitterError(`${field} is required`);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build the identity-bearing command envelope for a renderer UI action.
 * Pure and deterministic apart from minted ids/timestamp: it validates the
 * shape, attaches identity + transport metadata, and carries the payload
 * verbatim. It does NOT inspect the payload, branch on the action contract id,
 * or add any business-derived field.
 */
export function buildRendererCommandEnvelope(
  input: RendererCommandInput,
): RendererCommandEnvelope {
  const rendererId = requireNonEmpty(input.rendererId, 'renderer_id');
  const actionContractId = requireNonEmpty(input.actionContractId, 'action_contract_id');
  const contractVersion = requireNonEmpty(input.contractVersion, 'contract_version');

  if (!isPlainObject(input.payload)) {
    throw new RendererEmitterError('payload is required and must be an object');
  }

  let correlationId: string;
  if (input.correlationId === undefined) {
    correlationId = randomUUID();
  } else {
    if (!UUID_RE.test(input.correlationId)) {
      throw new RendererEmitterError('correlation_id must be a UUID when supplied');
    }
    correlationId = input.correlationId;
  }

  let causationId: string | null = null;
  if (input.causationId !== undefined) {
    if (!UUID_RE.test(input.causationId)) {
      throw new RendererEmitterError('causation_id must be a UUID when supplied');
    }
    causationId = input.causationId;
  }

  return {
    envelope_id: randomUUID(),
    envelope_timestamp: new Date().toISOString(),
    correlation_id: correlationId,
    causation_id: causationId,
    renderer_id: rendererId,
    action_contract_id: actionContractId,
    contract_version: contractVersion,
    source_tool: 'omnidash-ui',
    tenant_id: input.tenantContext?.tenant_id ?? null,
    tenant_slug: input.tenantContext?.tenant_slug ?? null,
    tenant_sub: input.tenantContext?.sub ?? null,
    payload: input.payload,
    transport: {
      kind: 'thin-publish',
      producer: PRODUCER_ID,
      topic: RENDERER_ACTION_TOPIC,
    },
  };
}

/** Dispatcher seam. Production must provide it through the runtime edge. */
export interface RendererEmitterDeps {
  publish?: (topic: string, value: unknown) => Promise<void>;
}

/**
 * Build a renderer UI action and hand it to a configured runtime dispatcher.
 * Returns the emitted envelope so the route layer can echo identity.
 */
export async function emitRendererCommand(
  input: RendererCommandInput,
  deps: RendererEmitterDeps = {},
): Promise<RendererCommandEnvelope> {
  const publish = deps.publish;
  if (!publish) {
    throw new RendererEmitterError(
      'renderer action dispatcher is not configured on the runtime edge',
    );
  }
  const envelope = buildRendererCommandEnvelope(input);
  await publish(RENDERER_ACTION_TOPIC, envelope);
  return envelope;
}

// OMN-16840: read the routing authority's own availability declaration.
//
// `omnimarket/src/omnimarket/configs/task_class_contracts.v1.yaml` declares a
// `routing_availability` block on any task class no routing tier can serve
// (landed in omnimarket#2179 for `agent_delegation`, whose tiers are all HTTP
// chat-completion backends and so cannot execute agentic work). That block
// exists so a consumer — this dashboard's task-type menu, the gateway's
// admission check — refuses the class up front instead of offering it and
// letting the delegation wait out the full ingress budget on
// ONEX_CORE_041_INVALID_CONFIGURATION.
//
// `shared/contracts/delegation-task-types.json` mirrors that declaration.
// Absence of the block means the class routes: the 12 classes with no block
// are unaffected. Only a declared, non-`available` status closes a class.

export type DelegationRoutingAvailabilityStatus = 'available' | 'pending_capability';

export interface DelegationRoutingAvailability {
  readonly status: string;
  readonly missing_capability?: string;
  readonly tracking?: string;
  readonly reason?: string;
}

export interface DelegationTaskTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly prompt_placeholder: string;
  readonly routing_availability?: DelegationRoutingAvailability;
}

/**
 * A task class is routable unless the contract declares it otherwise.
 * Undeclared availability is availability — the routing authority only writes
 * this block when it knows a class cannot be served.
 */
export function isTaskTypeRoutable(taskType: DelegationTaskTypeDefinition): boolean {
  const declared = taskType.routing_availability;
  if (!declared) return true;
  return declared.status === 'available';
}

/**
 * The operator-facing explanation for a closed class, taken verbatim from the
 * contract. The dashboard renders the declared reason; it does not author one.
 */
export function unavailableReason(taskType: DelegationTaskTypeDefinition): string | null {
  if (isTaskTypeRoutable(taskType)) return null;
  const declared = taskType.routing_availability;
  return declared?.reason ?? `Task class "${taskType.id}" is declared ${declared?.status ?? 'unavailable'}.`;
}

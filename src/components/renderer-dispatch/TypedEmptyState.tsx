// OMN-13131 (W6, G-H): renderer-agnostic typed empty-state surface.
//
// Renders a typed, operator-facing empty state keyed on the canonical
// `EmptyStateReason` VALUE — never a blank/blind element. The reason value is
// exposed as a `data-empty-state-reason` attribute so any consumer (test,
// non-React snapshot, accessibility tooling) can assert the typed reason without
// depending on the human message text.

import { Text } from '@/components/ui/typography';
import {
  type EmptyStateReason,
  EMPTY_STATE_REASON_MESSAGES,
} from '@shared/types/empty-state-reason';

export interface TypedEmptyStateProps {
  /** The canonical reason VALUE (e.g. 'upstream-blocked'). */
  reason: EmptyStateReason;
  /**
   * Optional diagnostic detail surfaced beneath the headline message
   * (e.g. the dispatcher miss reason). Never replaces the typed reason.
   */
  detail?: string;
}

/**
 * Typed empty state. The `reason` value selects a distinct diagnostic message
 * (reasons are never collapsed into one another); the value itself is rendered
 * onto `data-empty-state-reason` so the typed state is machine-verifiable.
 */
export function TypedEmptyState({ reason, detail }: TypedEmptyStateProps) {
  return (
    <div data-empty-state-reason={reason} role="status">
      <Text as="div" size="lg" color="tertiary">
        {EMPTY_STATE_REASON_MESSAGES[reason]}
      </Text>
      {detail ? (
        <Text as="div" size="sm" color="tertiary">
          {detail}
        </Text>
      ) : null}
    </div>
  );
}

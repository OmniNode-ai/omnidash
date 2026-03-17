/**
 * OmniBase Infra domain handler [OMN-5191]
 *
 * Placeholder for topics with the omnibase-infra prefix.
 * Currently no topics are exclusively handled by this domain --
 * infrastructure events (node registry, heartbeat, etc.) are handled
 * by the platform handler since they use platform topic suffixes.
 *
 * This handler exists as an extension point for future omnibase-infra
 * specific topics that don't fit the platform domain.
 */

import type { KafkaMessage } from 'kafkajs';
import type { DomainHandler, ConsumerContext } from './types';

export class OmnibaseInfraHandler implements DomainHandler {
  readonly name = 'omnibase-infra';

  canHandle(_topic: string): boolean {
    // No omnibase-infra-specific topics yet; platform-handler covers infra events
    return false;
  }

  handleEvent(
    _topic: string,
    _event: Record<string, unknown>,
    _message: KafkaMessage,
    _ctx: ConsumerContext
  ): void {
    // No-op: extension point for future omnibase-infra topics
  }
}

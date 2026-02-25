/**
 * Contract Event Emitter
 *
 * Fire-and-forget Kafka producer for contract lifecycle state transition events.
 * Used by contract-registry-routes.ts to emit events on publish, deprecate, archive.
 *
 * Events emitted (topic: contract-lifecycle-events):
 * - contract_published  — { contract_id, version, actor, timestamp, environment }
 * - contract_deprecated — { contract_id, version, actor, timestamp }
 * - contract_archived   — { contract_id, version, actor, timestamp }
 *
 * Design: Non-blocking. Failures are logged but never propagate to the caller.
 * Kafka connectivity is optional — if brokers are not configured, events are skipped.
 */

import { Kafka, Producer } from 'kafkajs';
import { randomUUID } from 'crypto';

// Event topic for contract lifecycle transitions
export const CONTRACT_LIFECYCLE_TOPIC =
  process.env.CONTRACT_LIFECYCLE_TOPIC || 'contract-lifecycle-events';

// Contract lifecycle event types
export type ContractLifecycleEventType =
  | 'contract_published'
  | 'contract_deprecated'
  | 'contract_archived';

/**
 * Contract lifecycle event payload (ONEX envelope format)
 */
export interface ContractLifecycleEvent {
  event_id: string;
  event_type: ContractLifecycleEventType;
  correlation_id: string;
  timestamp: string;
  service: string;
  payload: {
    contract_id: string;
    contract_logical_id: string;
    version: string;
    actor: string;
    environment: string;
    content_hash?: string;
  };
}

/**
 * Lazy singleton producer for contract lifecycle events.
 * Only initialized if Kafka brokers are configured.
 */
class ContractEventEmitter {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private connecting = false;

  private getBrokers(): string[] | null {
    const brokerString = process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS;
    if (!brokerString) return null;
    return brokerString.split(',').filter(Boolean);
  }

  /**
   * Ensure producer is connected.
   * Returns false if Kafka is not configured or connection fails.
   */
  private async ensureConnected(): Promise<boolean> {
    if (this.producer) return true;
    if (this.connecting) return false;

    const brokers = this.getBrokers();
    if (!brokers || brokers.length === 0) {
      return false;
    }

    try {
      this.connecting = true;
      this.kafka = new Kafka({
        brokers,
        clientId: 'omnidash-contract-emitter',
        connectionTimeout: 3000,
        requestTimeout: 5000,
      });
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
      });
      await this.producer.connect();
      this.connecting = false;
      return true;
    } catch (error) {
      this.connecting = false;
      this.producer = null;
      this.kafka = null;
      console.warn('[ContractEventEmitter] Failed to connect to Kafka:', error);
      return false;
    }
  }

  /**
   * Emit a contract lifecycle event.
   * Non-blocking: failures are logged, not thrown.
   */
  async emit(
    eventType: ContractLifecycleEventType,
    payload: {
      contractId: string;
      contractLogicalId: string;
      version: string;
      actor?: string;
      contentHash?: string;
    }
  ): Promise<void> {
    try {
      const connected = await this.ensureConnected();
      if (!connected || !this.producer) {
        // Kafka not configured — skip silently (expected in dev without broker)
        return;
      }

      const event: ContractLifecycleEvent = {
        event_id: randomUUID(),
        event_type: eventType,
        correlation_id: randomUUID(),
        timestamp: new Date().toISOString(),
        service: 'omnidash',
        payload: {
          contract_id: payload.contractId,
          contract_logical_id: payload.contractLogicalId,
          version: payload.version,
          actor: payload.actor ?? 'system',
          environment: process.env.NODE_ENV ?? 'development',
          ...(payload.contentHash ? { content_hash: payload.contentHash } : {}),
        },
      };

      await this.producer.send({
        topic: CONTRACT_LIFECYCLE_TOPIC,
        messages: [
          {
            key: payload.contractLogicalId,
            value: JSON.stringify(event),
          },
        ],
      });
    } catch (error) {
      // Non-blocking: log but never propagate
      console.warn(`[ContractEventEmitter] Failed to emit ${eventType}:`, error);
    }
  }

  /**
   * Gracefully disconnect.
   * Called during server shutdown.
   */
  async disconnect(): Promise<void> {
    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch (_err) {
        // Ignore disconnect errors during shutdown
      }
      this.producer = null;
      this.kafka = null;
    }
  }
}

// Singleton instance used by contract-registry-routes
export const contractEventEmitter = new ContractEventEmitter();

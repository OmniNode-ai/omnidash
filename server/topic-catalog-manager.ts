/**
 * TopicCatalogManager (OMN-2315)
 *
 * Encapsulates the topic-catalog bootstrap protocol for the dashboard:
 *
 *   1. On start(): create a dedicated Kafka consumer with a stable per-process
 *      consumer group `omnidash.catalog.{instanceUuid}` and subscribe to the
 *      response + changed topics.
 *   2. Publish a ModelTopicCatalogQuery to the catalog command topic.
 *   3. On catalog response (filtered by correlation_id): emit 'catalogReceived'
 *      with the topic list and any warnings.
 *   4. On catalog-changed delta: emit 'catalogChanged' with the add/remove delta.
 *   5. If no response arrives within CATALOG_TIMEOUT_MS: emit 'catalogTimeout'.
 *
 * The manager uses its own dedicated Kafka producer + consumer so it does not
 * interfere with the main EventConsumer's consumer group offsets.
 *
 * Cross-talk prevention:
 *   - Each manager instance generates a unique `correlationId` per bootstrap call.
 *   - Incoming catalog-response messages are discarded unless their `correlation_id`
 *     matches the outstanding query. This prevents multiple dashboard instances
 *     from processing each other's responses (shared response topic, Option B).
 *   - The consumer group `omnidash.catalog.{instanceUuid}` is unique per process,
 *     preventing Kafka consumer group accumulation across page reloads (which do
 *     not restart the server process).
 */

import { EventEmitter } from 'events';
import crypto from 'node:crypto';
import { Kafka, type Consumer, type Producer } from 'kafkajs';
import {
  SUFFIX_PLATFORM_TOPIC_CATALOG_QUERY,
  SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE,
  SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED,
  extractSuffix,
} from '@shared/topics';
import {
  TopicCatalogResponseSchema,
  TopicCatalogChangedSchema,
} from '@shared/schemas/topic-catalog';
import type { TopicCatalogResponse, TopicCatalogChanged } from '@shared/schemas/topic-catalog';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * How long (ms) to wait for a catalog response before falling back to the
 * hardcoded topic list. Defaults to 5 000 ms in production, 200 ms in tests.
 *
 * Can be overridden via the `CATALOG_TIMEOUT_MS` environment variable.
 * The parsed value is validated: if the env var is absent, empty, non-numeric
 * (e.g. `"abc"`), or non-positive, `parseInt` returns `NaN` or a value ≤ 0 —
 * both of which would cause `setTimeout` to fire immediately. In those cases
 * the constant falls back to the environment-appropriate default (200 ms in
 * test, 5 000 ms in production).
 */
const _catalogTimeoutEnv = parseInt(process.env.CATALOG_TIMEOUT_MS ?? '', 10);
const _catalogTimeoutDefault =
  process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' ? 200 : 5000;
export const CATALOG_TIMEOUT_MS =
  Number.isNaN(_catalogTimeoutEnv) || _catalogTimeoutEnv <= 0
    ? _catalogTimeoutDefault
    : _catalogTimeoutEnv;

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export interface CatalogReceivedEvent {
  topics: string[];
  warnings: string[];
  correlationId: string;
}

export interface CatalogChangedEvent {
  topicsAdded: string[];
  topicsRemoved: string[];
}

export interface TopicCatalogManagerEvents {
  catalogReceived: (event: CatalogReceivedEvent) => void;
  catalogChanged: (event: CatalogChangedEvent) => void;
  catalogTimeout: () => void;
}

// ---------------------------------------------------------------------------
// TopicCatalogManager
// ---------------------------------------------------------------------------

export class TopicCatalogManager extends EventEmitter {
  /**
   * Stable UUID for this server process instance.
   * Generated once at construction, not per page load.
   * Defines the per-process Kafka consumer group name.
   */
  public readonly instanceUuid: string;

  /**
   * Consumer group ID used by this manager's dedicated Kafka consumer.
   * Format: `omnidash.catalog.{instanceUuid}`
   */
  public readonly consumerGroupId: string;

  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;

  /** The correlation_id of the outstanding bootstrap query (if any). */
  private outstandingCorrelationId: string | null = null;

  /** Whether the manager has already received a successful catalog response. */
  private catalogReceived = false;

  /** Timeout handle for the bootstrap response window. */
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  /** Whether stop() has been called. */
  private stopped = false;

  constructor(kafka?: Kafka) {
    super();

    this.instanceUuid = crypto.randomUUID();
    this.consumerGroupId = `omnidash.catalog.${this.instanceUuid}`;

    // Allow callers to inject a Kafka instance (useful for testing).
    // In production, build one from environment variables.
    if (kafka) {
      this.kafka = kafka;
    } else {
      const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;
      if (!brokers) {
        throw new Error(
          'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required.'
        );
      }
      this.kafka = new Kafka({
        clientId: `omnidash-catalog-manager-${this.instanceUuid}`,
        brokers: brokers.split(','),
        connectionTimeout: 5000,
        requestTimeout: 10000,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Bootstrap the catalog:
   *   1. Connect the dedicated producer.
   *   2. Connect the dedicated consumer.
   *   3. Subscribe to the catalog-response and catalog-changed topics.
   *   4. Start the consumer run loop.
   *   5. Publish a ModelTopicCatalogQuery with a fresh correlation_id.
   *   6. Arm a timeout — if no response arrives within CATALOG_TIMEOUT_MS, emit 'catalogTimeout'.
   *
   * A `stopped` guard is evaluated after each of the five async steps above.
   * If `stop()` has been called mid-startup, `stop()` is awaited to disconnect
   * any already-connected resources and the method returns immediately.
   *
   * @param correlationId Optional override for the outgoing correlation_id.
   *   When omitted, a UUID is generated for this bootstrap call.
   */
  async bootstrap(correlationId?: string): Promise<void> {
    if (this.stopped) {
      return;
    }

    const corrId = correlationId ?? crypto.randomUUID();
    this.outstandingCorrelationId = corrId;
    this.catalogReceived = false;

    // Build producer
    this.producer = this.kafka.producer();
    await this.producer.connect();
    if (this.stopped) {
      await this.stop();
      return;
    }

    // Build consumer with stable per-process group
    this.consumer = this.kafka.consumer({
      groupId: this.consumerGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 10000,
    });
    await this.consumer.connect();
    if (this.stopped) {
      await this.stop();
      return;
    }

    // Subscribe to response topic (where the catalog service replies)
    await this.consumer.subscribe({
      topics: [SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE, SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED],
      fromBeginning: false,
    });
    if (this.stopped) {
      await this.stop();
      return;
    }

    // Start consuming
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        this.handleMessage(topic, message.value?.toString());
      },
    });
    if (this.stopped) {
      await this.stop();
      return;
    }

    // Publish the query
    await this.publishQuery(corrId);
    if (this.stopped) {
      await this.stop();
      return;
    }

    // Arm the timeout fallback
    this.timeoutHandle = setTimeout(() => {
      if (!this.catalogReceived && !this.stopped) {
        console.warn(
          `[TopicCatalogManager] No catalog response received within ${CATALOG_TIMEOUT_MS}ms — using fallback topics`
        );
        this.emit('catalogTimeout');
      }
    }, CATALOG_TIMEOUT_MS);
  }

  /**
   * Stop the manager: disconnect producer and consumer, cancel timeout.
   */
  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        this.consumer = null;
      }
    } catch (err) {
      console.warn('[TopicCatalogManager] Error disconnecting consumer:', err);
    }

    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.producer = null;
      }
    } catch (err) {
      console.warn('[TopicCatalogManager] Error disconnecting producer:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async publishQuery(correlationId: string): Promise<void> {
    if (!this.producer) return;

    const clientId = `omnidash-${this.instanceUuid}`;
    const payload = { client_id: clientId, correlation_id: correlationId };

    try {
      await this.producer.send({
        topic: SUFFIX_PLATFORM_TOPIC_CATALOG_QUERY,
        messages: [{ value: JSON.stringify(payload) }],
      });
      console.log(
        `[TopicCatalogManager] Published topic-catalog-query (correlation_id=${correlationId})`
      );
    } catch (err) {
      console.error('[TopicCatalogManager] Failed to publish catalog query:', err);
      // Arm the timeout so the fallback still fires; don't re-throw.
    }
  }

  private handleMessage(rawTopic: string, rawValue: string | undefined): void {
    if (this.stopped) return;

    // Strip optional env prefix so comparisons work for both
    // "onex.evt.platform.topic-catalog-response.v1" and
    // "dev.onex.evt.platform.topic-catalog-response.v1".
    const topic = extractSuffix(rawTopic);

    if (topic === SUFFIX_PLATFORM_TOPIC_CATALOG_RESPONSE) {
      this.handleCatalogResponse(rawValue);
      return;
    }

    if (topic === SUFFIX_PLATFORM_TOPIC_CATALOG_CHANGED) {
      this.handleCatalogChanged(rawValue);
      return;
    }
  }

  private handleCatalogResponse(rawValue: string | undefined): void {
    if (!rawValue) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      console.warn('[TopicCatalogManager] Received malformed catalog-response JSON — skipping');
      return;
    }

    let response: TopicCatalogResponse;
    try {
      response = TopicCatalogResponseSchema.parse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[TopicCatalogManager] catalog-response failed schema validation:', msg);
      return;
    }

    // Cross-talk prevention: only accept responses that match our outstanding query.
    if (response.correlation_id !== this.outstandingCorrelationId) {
      console.log(
        `[TopicCatalogManager] Ignoring catalog-response with unmatched correlation_id ` +
          `(expected=${this.outstandingCorrelationId}, got=${response.correlation_id})`
      );
      return;
    }

    // Cancel the timeout — we got a valid response.
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    this.catalogReceived = true;
    const topics = response.topics.map((t) => t.topic_name);

    console.log(
      `[TopicCatalogManager] Catalog response received: ${topics.length} topics` +
        (response.warnings.length > 0 ? `, ${response.warnings.length} warning(s)` : '')
    );

    const event: CatalogReceivedEvent = {
      topics,
      warnings: response.warnings,
      correlationId: response.correlation_id,
    };
    this.emit('catalogReceived', event);
  }

  private handleCatalogChanged(rawValue: string | undefined): void {
    if (!rawValue) return;

    // Only process changed events after we've received the initial response.
    // Before that, the full catalog hasn't been established yet.
    if (!this.catalogReceived) {
      console.log(
        '[TopicCatalogManager] Ignoring catalog-changed — initial catalog not yet received'
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      console.warn('[TopicCatalogManager] Received malformed catalog-changed JSON — skipping');
      return;
    }

    let changed: TopicCatalogChanged;
    try {
      changed = TopicCatalogChangedSchema.parse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[TopicCatalogManager] catalog-changed failed schema validation:', msg);
      return;
    }

    const event: CatalogChangedEvent = {
      topicsAdded: changed.topics_added,
      topicsRemoved: changed.topics_removed,
    };

    console.log(
      `[TopicCatalogManager] Catalog changed: +${event.topicsAdded.length} -${event.topicsRemoved.length}`
    );
    this.emit('catalogChanged', event);
  }
}

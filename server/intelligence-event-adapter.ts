import { Kafka, Producer, Consumer } from 'kafkajs';
import { randomUUID } from 'crypto';
import {
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_REQUESTED,
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_COMPLETED,
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_FAILED,
} from '@shared/topics';

/**
 * Payload type for `IntelligenceEventAdapter.request()`.
 *
 * Note: `Omit` on an index signature (`Record<string, unknown>`) does NOT
 * enforce exclusion at compile time — TypeScript will still allow passing the
 * omitted keys (`event_id`, `event_type`, `source`, `timestamp`). This type
 * serves as documentation only: callers should NOT pass these fields, as they
 * belong to the outer envelope layer rather than the inner payload. There is
 * no compile-time error if they are included.
 *
 * TypeScript limitation: Omit<Record<string, unknown>, ...> does not exclude
 * specific string-literal keys from an index signature at compile time.
 * This type serves as documentation convention only — there is no available
 * compile-time enforcement mechanism for this constraint.
 *
 * Note: `correlation_id` is intentionally NOT excluded from this type. It is a
 * supported convenience input — the `request()` method extracts it and promotes
 * it to the outer envelope, so it is safe to pass and will not leak into the
 * inner payload.
 */
type PayloadOverride = Omit<
  Record<string, unknown>,
  'event_id' | 'event_type' | 'source' | 'timestamp'
>;

/**
 * Error class for intelligence request failures with optional error code.
 * Used when intelligence requests fail with structured error information.
 */
export class IntelligenceError extends Error {
  /** Optional error code from the intelligence service */
  readonly error_code?: string;

  constructor(message: string, error_code?: string) {
    super(message);
    this.name = 'IntelligenceError';
    this.error_code = error_code;
  }
}

/**
 * IntelligenceEventAdapter
 * - Request/response over Kafka for intelligence operations
 * - Correlation ID tracking with in-memory pending map
 * - Timeout + graceful fallback supported by caller
 */
export class IntelligenceEventAdapter {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;
  private _started = false;

  /** Whether the adapter has been started and is ready for requests */
  get started(): boolean {
    return this._started;
  }

  private pending: Map<
    string,
    {
      resolve: (v: any) => void;
      reject: (e: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  // Default topics aligned with OmniArchon/OmniClaude patterns.
  // Uses legacy archon-intelligence topic names (see shared/topics.ts).
  // Override via env vars for canonical ONEX migration.
  public readonly TOPIC_REQUEST =
    process.env.INTEL_REQUEST_TOPIC || LEGACY_INTELLIGENCE_CODE_ANALYSIS_REQUESTED;
  public readonly TOPIC_COMPLETED =
    process.env.INTEL_COMPLETED_TOPIC || LEGACY_INTELLIGENCE_CODE_ANALYSIS_COMPLETED;
  public readonly TOPIC_FAILED =
    process.env.INTEL_FAILED_TOPIC || LEGACY_INTELLIGENCE_CODE_ANALYSIS_FAILED;

  constructor(
    private readonly brokers: string[] = (() => {
      const brokerString = process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS;
      if (!brokerString) {
        throw new Error(
          'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required. ' +
            'Set it in .env file or export it before starting the server. ' +
            'Example: KAFKA_BROKERS=host:port'
        );
      }
      return brokerString.split(',');
    })()
  ) {
    this.kafka = new Kafka({ brokers: this.brokers, clientId: 'omnidash-intelligence-adapter' });
  }

  async start(): Promise<void> {
    if (this._started) return;

    this.producer = this.kafka.producer();
    await this.producer.connect();

    this.consumer = this.kafka.consumer({ groupId: `omnidash-intel-${randomUUID().slice(0, 8)}` });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.TOPIC_COMPLETED, fromBeginning: false });
    await this.consumer.subscribe({ topic: this.TOPIC_FAILED, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = message.value?.toString();
          if (!value) return;

          let event: any;
          try {
            event = JSON.parse(value);
          } catch (e) {
            console.warn(
              `[IntelligenceAdapter] Error parsing message from ${topic}:${partition}:${message.offset} - skipping`,
              e
            );
            return;
          }

          // Extract correlation_id (may be top-level or in payload)
          const correlationIdRaw =
            event?.correlation_id ||
            event?.correlationId ||
            event?.payload?.correlation_id ||
            message.key?.toString();
          const correlationId = correlationIdRaw
            ? String(correlationIdRaw).toLowerCase()
            : undefined;
          if (!correlationId) return;

          const pending = this.pending.get(correlationId);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(correlationId);

          if (topic === this.TOPIC_COMPLETED || event?.event_type === 'CODE_ANALYSIS_COMPLETED') {
            // Extract payload from ONEX envelope format
            const result = event?.payload || event;
            pending.resolve(result);
          } else if (topic === this.TOPIC_FAILED || event?.event_type === 'CODE_ANALYSIS_FAILED') {
            // Extract error details from payload
            const errorPayload = event?.payload || event;
            const errorMsg =
              errorPayload?.error_message || errorPayload?.error || 'Intelligence request failed';
            const error = new IntelligenceError(errorMsg, errorPayload?.error_code);
            pending.reject(error);
          }
        } catch (err) {
          // Swallow to avoid consumer crash; the caller gets timeout fallback
          console.error('[IntelligenceAdapter] Error processing response:', err);
        }
      },
    });

    this._started = true;
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    this._started = false;
  }

  /**
   * Generic request method - matches OmniClaude/OmniArchon ONEX event format.
   *
   * The `payload` parameter is spread at the end of the inner envelope payload
   * object (see `...payload` inside the `envelope.payload` construction). This
   * means any key in `payload` that matches a pre-set envelope field —
   * including `source_path`, `content`, `language`, `operation_type`,
   * `project_id`, `user_id`, etc. — will silently overwrite the default value.
   * This is intentional: callers can use the spread to override any field.
   * However, callers should be careful not to pass conflicting keys
   * unintentionally, as there is no warning when an override occurs.
   *
   * @param requestType - The type identifier for the intelligence request (e.g. `'code_analysis'`).
   * @param payload - Additional fields merged into the envelope payload.
   *   By convention, the following envelope-level keys should NOT be included,
   *   as they belong to the outer envelope and passing them here places them
   *   in the wrong layer. Note: this is not enforced at compile time — see
   *   the `PayloadOverride` type comment for details.
   *   - `event_id`
   *   - `event_type`
   *   - `source`
   *   - `timestamp`
   *   `correlation_id` IS supported: it is explicitly extracted from `payload`
   *   before the spread and placed on the outer envelope. Both `correlation_id`
   *   and `correlationId` are destructured out before the spread so they are
   *   excluded from the inner payload.
   *   Any key matching a pre-constructed field (`source_path`, `content`,
   *   `language`, `operation_type`, `project_id`, `user_id`) will silently
   *   overwrite it.
   * @param timeoutMs - Milliseconds before the request is rejected with a timeout error (default: 5000).
   */
  async request(
    requestType: string,
    payload: PayloadOverride = {},
    timeoutMs: number = 5000
  ): Promise<any> {
    if (!this._started || !this.producer) throw new Error('IntelligenceEventAdapter not started');

    const rawCorrelationId = payload?.correlation_id || payload?.correlationId || randomUUID();
    const correlationId = String(rawCorrelationId);
    const correlationKey = correlationId.toLowerCase();

    // Exclude correlation_id / correlationId from the inner payload spread so they
    // are not duplicated inside envelope.payload (they belong on the outer envelope only).
    const { correlation_id: _cid, correlationId: _cidCamel, ...payloadRest } = payload;

    const reservedKeys = ['event_id', 'event_type', 'source', 'timestamp'] as const;
    for (const key of reservedKeys) {
      if (key in payloadRest) {
        console.warn(
          `[IntelligenceEventAdapter] payload contains reserved envelope key '${key}' — it will silently overwrite the envelope field. Pass it as a top-level argument instead.`
        );
      }
    }

    // Format matches OmniClaude's _create_request_payload format
    // Handler expects: event_type, correlation_id, payload (with source_path, language, etc.)
    const envelope = {
      event_id: randomUUID(),
      event_type: 'CODE_ANALYSIS_REQUESTED',
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
      service: 'omnidash',
      payload: {
        source_path: payloadRest.sourcePath || payloadRest.source_path || '',
        content: payloadRest.content || null,
        language: payloadRest.language || 'python',
        operation_type: payloadRest.operation_type || payloadRest.operationType || 'PATTERN_EXTRACTION',
        options: payloadRest.options || {},
        project_id: payloadRest.projectId || payloadRest.project_id || 'omnidash',
        user_id: payloadRest.userId || payloadRest.user_id || 'system',
        ...payloadRest, // Allow override of any fields
      },
    };

    // Promise with timeout tracking
    const promise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(correlationKey);
        reject(new Error('Intelligence request timed out'));
      }, timeoutMs);
      this.pending.set(correlationKey, { resolve, reject, timeout });
    });

    await this.producer.send({
      topic: this.TOPIC_REQUEST,
      messages: [{ key: correlationKey, value: JSON.stringify(envelope) }],
    });

    return promise;
  }

  /**
   * Request pattern discovery (higher-level wrapper)
   */
  async requestPatternDiscovery(
    params: { sourcePath: string; language?: string; project?: string; operationType?: string },
    timeoutMs?: number
  ) {
    return this.request(
      'code_analysis',
      {
        sourcePath: params.sourcePath,
        language: params.language,
        project_id: params.project,
        operation_type: params.operationType || 'PATTERN_EXTRACTION',
      },
      timeoutMs
    );
  }
}

// ============================================================================
// Lazy Initialization Pattern (prevents startup crashes)
// ============================================================================

let intelligenceEventsInstance: IntelligenceEventAdapter | null = null;
let intelligenceInitError: Error | null = null;

/**
 * Get IntelligenceEventAdapter singleton with lazy initialization
 *
 * This pattern prevents the application from crashing at module load time
 * when KAFKA_BROKERS is absent. Note: a missing KAFKA_BROKERS is a
 * misconfiguration error — Kafka is required infrastructure. A null return
 * from this function means the application is not connected to Kafka and
 * is in a degraded/error state.
 *
 * @returns IntelligenceEventAdapter instance or null if initialization failed (error state)
 */
export function getIntelligenceEvents(): IntelligenceEventAdapter | null {
  // Return cached instance if already initialized
  if (intelligenceEventsInstance) {
    return intelligenceEventsInstance;
  }

  // Return null if we previously failed to initialize
  if (intelligenceInitError) {
    return null;
  }

  // Attempt lazy initialization
  try {
    intelligenceEventsInstance = new IntelligenceEventAdapter();
    return intelligenceEventsInstance;
  } catch (error) {
    intelligenceInitError = error instanceof Error ? error : new Error(String(error));
    console.error(
      '❌ IntelligenceEventAdapter initialization failed:',
      intelligenceInitError.message
    );
    console.error('   Kafka is required infrastructure. Set KAFKA_BROKERS in .env to connect to the Redpanda/Kafka broker.');
    console.error('   Intelligence event operations are unavailable — this is an error state, not normal operation.');
    return null;
  }
}

/**
 * Check if IntelligenceEventAdapter is available.
 *
 * Pure predicate — does NOT trigger initialization. Returns true only if the
 * singleton was already successfully initialized. Call `getIntelligenceEvents()`
 * first to trigger initialization. Returns false if initialization has not been
 * attempted or failed.
 */
export function isIntelligenceEventsAvailable(): boolean {
  return intelligenceEventsInstance !== null;
}

/**
 * Get initialization error if IntelligenceEventAdapter failed to initialize
 */
export function getIntelligenceEventsError(): Error | null {
  return intelligenceInitError;
}

/**
 * Backward compatibility: Proxy that delegates to lazy getter
 *
 * @deprecated Use getIntelligenceEvents() for better error handling
 */
export const intelligenceEvents = new Proxy({} as IntelligenceEventAdapter, {
  get(target, prop) {
    const instance = getIntelligenceEvents();
    if (!instance) {
      // Return dummy implementations
      if (prop === 'start' || prop === 'stop') {
        return async () => {
          console.error('❌ IntelligenceEventAdapter not available - KAFKA_BROKERS is not configured. Kafka is required infrastructure.');
        };
      }
      if (prop === 'request' || prop === 'requestPatternDiscovery') {
        return async () => {
          throw new Error('IntelligenceEventAdapter not available - KAFKA_BROKERS is not configured. Kafka is required infrastructure.');
        };
      }
      if (prop === 'started') {
        return false;
      }
      // Return readonly topic properties
      if (prop === 'TOPIC_REQUEST' || prop === 'TOPIC_COMPLETED' || prop === 'TOPIC_FAILED') {
        return '';
      }
      return undefined;
    }
    // Delegate to actual instance
    // Type assertion needed for Proxy property access - TypeScript doesn't fully support dynamic property access in Proxies
    const value = instance[prop as keyof IntelligenceEventAdapter];
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});

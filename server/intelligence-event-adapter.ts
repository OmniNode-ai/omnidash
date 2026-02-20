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
 * TypeScript limitation: `Omit<Record<string, unknown>, ...>` does NOT exclude
 * specific string-literal keys from an index signature at compile time.
 * This type is documentation convention only — there is no compile-time
 * enforcement mechanism for these constraints.
 *
 * Reserved envelope keys (`event_id`, `event_type`, `source`, `timestamp`,
 * `correlation_id`) receive special handling at runtime:
 * - `event_id`, `event_type`, `source`, `timestamp`: STRIPPED from the inner
 *   payload before spreading; a `console.warn` is emitted if any are present.
 *   They will NOT appear in the emitted envelope payload.
 * - `correlation_id` (and `correlationId`): extracted and promoted to the outer
 *   envelope; neither leaks into the inner payload.
 *
 * All other keys are spread directly into the inner payload object. Any key
 * matching a pre-constructed field (`source_path`, `content`, `language`,
 * `operation_type`, `project_id`, `user_id`) will overwrite the default value.
 * In non-production environments a `console.warn` is emitted when this occurs
 * so unintentional overrides are surfaced during development.
 */
type PayloadOverride = Omit<
  Record<string, unknown>,
  'event_id' | 'event_type' | 'source' | 'timestamp' | 'correlation_id'
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
   * See the `PayloadOverride` type for full documentation of how reserved
   * envelope keys and pre-constructed inner payload fields are handled at
   * runtime. In summary:
   * - `event_id`, `event_type`, `source`, `timestamp`: stripped from the
   *   inner payload (with a `console.warn`); do not appear in the output.
   * - `correlation_id` / `correlationId`: extracted and promoted to the outer
   *   envelope; neither leaks into the inner payload.
   * - All other keys are spread into the inner payload. Fields matching
   *   `source_path`, `content`, `language`, `operation_type`, `project_id`,
   *   or `user_id` will overwrite the default value; a `console.warn` is
   *   emitted in non-production environments when this happens.
   *
   * @param requestType - The type identifier for the intelligence request (e.g. `'code_analysis'`).
   * @param payload - Additional fields merged into the envelope payload.
   *   See `PayloadOverride` type for key handling details.
   * @param timeoutMs - Milliseconds before the request is rejected with a timeout error (default: 5000).
   */
  async request(
    requestType: string,
    payload: PayloadOverride = {},
    timeoutMs: number = 5000
  ): Promise<any> {
    if (!this._started || !this.producer) throw new Error('IntelligenceEventAdapter not started');

    const rawCid = payload?.correlation_id;
    const rawCidCamel = payload?.correlationId;
    // Prefer correlation_id; fall back to correlationId; only generate a UUID when neither is present.
    // Intentionally avoids || short-circuit so that a falsy-but-valid value like 0 is preserved.
    // NOTE: Callers are responsible for ensuring correlation ID uniqueness. Passing a constant
    // value such as 0 across concurrent requests will result in those requests sharing the same
    // correlation ID string ("0"), which may cause response cross-talk in systems that route
    // responses or aggregate telemetry by correlationId.
    const rawCorrelationId =
      (typeof rawCid === 'string' || typeof rawCid === 'number')
        ? rawCid
        : (typeof rawCidCamel === 'string' || typeof rawCidCamel === 'number')
          ? rawCidCamel
          : randomUUID();
    // rawCorrelationId is always string | number at this point: the typeof guards above ensure
    // only string/number values from the payload are selected, and the UUID fallback is always
    // a string. String() coercion is unconditionally safe.
    const correlationId = String(rawCorrelationId);
    const correlationKey = correlationId.toLowerCase();

    // Exclude correlation_id / correlationId from the inner payload spread so they
    // are not duplicated inside envelope.payload (they belong on the outer envelope only).
    const { correlation_id: _cid, correlationId: _cidCamel, ...payloadRest } = payload;

    const reservedKeys = ['event_id', 'event_type', 'source', 'timestamp'] as const;
    const safePayloadRest: Record<string, unknown> = { ...payloadRest };
    for (const key of reservedKeys) {
      if (key in safePayloadRest) {
        console.warn(
          `[IntelligenceEventAdapter] payload contains reserved envelope key '${key}' — it has been removed to prevent overwriting the outer envelope field. Do not pass envelope-level keys in the payload argument.`
        );
        delete safePayloadRest[key];
      }
    }

    // Dev-only: warn when caller-supplied keys overwrite pre-constructed payload fields (overrides are supported by design).
    // NOTE: This check only fires for non-reserved keys. Reserved keys ('event_id', 'event_type',
    // 'source', 'timestamp') are stripped earlier in the loop above — before this point — so a
    // caller that passes a reserved key (e.g. 'source') which also appears in preConstructedKeys
    // will be silently stripped without triggering this warning. Do NOT add reserved keys to
    // preConstructedKeys expecting them to be caught here; they will never reach this check.
    if (process.env.NODE_ENV !== 'production') {
      const preConstructedKeys = [
        // snake_case canonical names
        'source_path', 'content', 'language', 'operation_type',
        'options', // dev notice: the adapter builds this key automatically from its config; callers may override it intentionally and the override will take effect — this warning is informational only, not a safety guard
        'project_id', 'user_id',
        // camelCase aliases accepted by the envelope build — warn on these too so
        // callers are not silently overwriting defaults regardless of which casing they use
        'sourcePath', 'operationType', 'projectId', 'userId',
      ] as const;
      for (const key of preConstructedKeys) {
        if (key in safePayloadRest) {
          console.warn(
            `[IntelligenceEventAdapter] payload key '${key}' will overwrite the pre-constructed default value. Pass this key intentionally only if you mean to override the default.`
          );
        }
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
        source_path: safePayloadRest.sourcePath || safePayloadRest.source_path || '',
        content: safePayloadRest.content || null,
        language: safePayloadRest.language || 'python',
        operation_type: safePayloadRest.operation_type || safePayloadRest.operationType || 'PATTERN_EXTRACTION',
        options: safePayloadRest.options || {},
        project_id: safePayloadRest.projectId || safePayloadRest.project_id || 'omnidash',
        user_id: safePayloadRest.userId || safePayloadRest.user_id || 'system',
        ...safePayloadRest, // Allow override of any fields
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

    try {
      await this.producer.send({
        topic: this.TOPIC_REQUEST,
        messages: [{ key: correlationKey, value: JSON.stringify(envelope) }],
      });
    } catch (sendError) {
      const entry = this.pending.get(correlationKey);
      if (entry) {
        clearTimeout(entry.timeout);
        this.pending.delete(correlationKey);
        entry.reject(sendError instanceof Error ? sendError : new Error(String(sendError)));
      } else {
        // The timeout already fired and removed the entry before producer.send() failed.
        // Log so the race is diagnosable — the caller already received a timeout rejection,
        // but this send error is otherwise silently lost without this warning.
        console.warn(
          `[IntelligenceEventAdapter] send error after timeout for correlationId "${correlationKey}" — ` +
          'the caller already received a timeout rejection; this send error is logged for diagnostics only.',
          sendError
        );
      }
      // Return the already-rejected promise rather than re-throwing here.
      // Async functions implicitly await any Promise they return, so the
      // caller's `await request(...)` will correctly receive the rejection
      // that entry.reject() delivered above. Re-throwing would create a
      // second, unrelated rejection; returning `promise` keeps exactly one
      // rejection surface and preserves the structured IntelligenceError type.
      return promise;
    }

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
 * Triggers lazy initialization if not yet done, then returns true if the
 * singleton was successfully initialized and false if initialization failed
 * (e.g. KAFKA_BROKERS not configured). Safe to call at any time — no prior
 * call to `getIntelligenceEvents()` is required.
 *
 * @remarks
 * **Side effect**: Triggers lazy initialization of the singleton if not yet
 * initialized. Calling this function is equivalent to calling
 * `getIntelligenceEvents()` plus a null check — both are safe to call at any
 * point.
 *
 * @performance Avoid calling in per-request hot paths. On the **first call**,
 * lazy initialization runs the `IntelligenceEventAdapter` constructor, which
 * reads environment variables and allocates a KafkaJS client object —
 * synchronous work, but non-trivial on the first invocation. No network I/O
 * occurs during construction; broker connections are established only when
 * `start()` is called. On **subsequent calls** (after initialization is
 * cached), the cost is negligible — a null check on a module-level variable.
 * Still, the semantic intent of this function is an initialization probe, not
 * a cheap boolean predicate; prefer calling it once at startup and caching
 * the result rather than checking it on every request.
 */
export function isIntelligenceEventsAvailable(): boolean {
  // Trigger lazy initialization if not yet done
  getIntelligenceEvents();
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
      if (prop === 'start') {
        /**
         * Proxy stub for start() when Kafka is not initialized.
         *
         * Throws asynchronously (consistent with the eventConsumer proxy's start stub)
         * so callers awaiting start() receive a rejected promise rather than a silent
         * undefined return. Kafka is required infrastructure — a missing KAFKA_BROKERS
         * env var is a misconfiguration error, not a graceful-degradation scenario.
         *
         * @throws {Error} Always rejects — Kafka was not configured or failed to
         *   initialize. Set KAFKA_BROKERS in .env and restart the server.
         */
        return async (..._args: unknown[]): Promise<never> => {
          throw new Error(
            '[IntelligenceEventAdapter] start() called but Kafka is not available — ' +
              'KAFKA_BROKERS is not configured. Set KAFKA_BROKERS in .env to restore intelligence event streaming.'
          );
        };
      }
      if (prop === 'stop') {
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

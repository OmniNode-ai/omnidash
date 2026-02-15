import { Kafka, Producer, Consumer } from 'kafkajs';
import { randomUUID } from 'crypto';
import {
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_REQUESTED,
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_COMPLETED,
  LEGACY_INTELLIGENCE_CODE_ANALYSIS_FAILED,
} from '@shared/topics';

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
          } catch {
            console.warn(
              `[IntelligenceAdapter] Error parsing message from ${topic}:${partition}:${message.offset} - skipping`
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
   * Generic request method - matches OmniClaude/OmniArchon ONEX event format
   */
  async request(
    requestType: string,
    payload: Record<string, any>,
    timeoutMs: number = 5000
  ): Promise<any> {
    if (!this._started || !this.producer) throw new Error('IntelligenceEventAdapter not started');

    const rawCorrelationId = payload?.correlation_id || payload?.correlationId || randomUUID();
    const correlationId = String(rawCorrelationId);
    const correlationKey = correlationId.toLowerCase();

    // Format matches OmniClaude's _create_request_payload format
    // Handler expects: event_type, correlation_id, payload (with source_path, language, etc.)
    const envelope = {
      event_id: randomUUID(),
      event_type: 'CODE_ANALYSIS_REQUESTED',
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
      service: 'omnidash',
      payload: {
        source_path: payload.sourcePath || payload.source_path || '',
        content: payload.content || null,
        language: payload.language || 'python',
        operation_type: payload.operation_type || payload.operationType || 'PATTERN_EXTRACTION',
        options: payload.options || {},
        project_id: payload.projectId || payload.project_id || 'omnidash',
        user_id: payload.userId || payload.user_id || 'system',
        ...payload, // Allow override of any fields
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
 * if KAFKA_BROKERS environment variable is not configured.
 *
 * @returns IntelligenceEventAdapter instance or null if initialization failed
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
    console.warn(
      '⚠️  IntelligenceEventAdapter initialization failed:',
      intelligenceInitError.message
    );
    console.warn('   Intelligence event operations will be disabled');
    console.warn('   Set KAFKA_BROKERS in .env file to enable intelligence events');
    return null;
  }
}

/**
 * Check if IntelligenceEventAdapter is available
 */
export function isIntelligenceEventsAvailable(): boolean {
  return intelligenceEventsInstance !== null || intelligenceInitError === null;
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
          console.warn('⚠️  IntelligenceEventAdapter not available (Kafka not configured)');
        };
      }
      if (prop === 'request' || prop === 'requestPatternDiscovery') {
        return async () => {
          throw new Error('IntelligenceEventAdapter not available (Kafka not configured)');
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

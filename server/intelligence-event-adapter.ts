import { Kafka, Producer, Consumer } from 'kafkajs';
import { randomUUID } from 'crypto';

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
  private started = false;
  private pending: Map<string, {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  // Default topics aligned with OmniArchon/OmniClaude patterns
  public readonly TOPIC_REQUEST = process.env.INTEL_REQUEST_TOPIC || 'dev.archon-intelligence.intelligence.code-analysis-requested.v1';
  public readonly TOPIC_COMPLETED = process.env.INTEL_COMPLETED_TOPIC || 'dev.archon-intelligence.intelligence.code-analysis-completed.v1';
  public readonly TOPIC_FAILED = process.env.INTEL_FAILED_TOPIC || 'dev.archon-intelligence.intelligence.code-analysis-failed.v1';

  constructor(private readonly brokers: string[] = (process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(',')) {
    this.kafka = new Kafka({ brokers: this.brokers, clientId: 'omnidash-intelligence-adapter' });
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.producer = this.kafka.producer();
    await this.producer.connect();

    this.consumer = this.kafka.consumer({ groupId: `omnidash-intel-${randomUUID().slice(0, 8)}` });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.TOPIC_COMPLETED, fromBeginning: true });
    await this.consumer.subscribe({ topic: this.TOPIC_FAILED, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const value = message.value?.toString();
          if (!value) return;
          const event = JSON.parse(value);
          
          // Extract correlation_id (may be top-level or in payload)
          const correlationId = event?.correlation_id || event?.correlationId || 
                                event?.payload?.correlation_id || 
                                message.key?.toString();
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
            const errorMsg = errorPayload?.error_message || errorPayload?.error || 'Intelligence request failed';
            const error = new Error(errorMsg);
            (error as any).error_code = errorPayload?.error_code;
            pending.reject(error);
          }
        } catch (err) {
          // Swallow to avoid consumer crash; the caller gets timeout fallback
          console.error('[IntelligenceAdapter] Error processing response:', err);
        }
      }
    });

    this.started = true;
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
    this.started = false;
  }

  /**
   * Generic request method - matches OmniClaude/OmniArchon ONEX event format
   */
  async request(requestType: string, payload: Record<string, any>, timeoutMs: number = 5000): Promise<any> {
    if (!this.started || !this.producer) throw new Error('IntelligenceEventAdapter not started');

    const correlationId = (payload?.correlation_id || payload?.correlationId || randomUUID()).toUpperCase();
    
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
        this.pending.delete(correlationId);
        reject(new Error('Intelligence request timed out'));
      }, timeoutMs);
      this.pending.set(correlationId, { resolve, reject, timeout });
    });

    await this.producer.send({
      topic: this.TOPIC_REQUEST,
      messages: [{ key: correlationId, value: JSON.stringify(envelope) }],
    });

    return promise;
  }

  /**
   * Request pattern discovery (higher-level wrapper)
   */
  async requestPatternDiscovery(params: { sourcePath: string; language?: string; project?: string; operationType?: string }, timeoutMs?: number) {
    return this.request('code_analysis', {
      sourcePath: params.sourcePath,
      language: params.language,
      project_id: params.project,
      operation_type: params.operationType || 'PATTERN_EXTRACTION',
    }, timeoutMs);
  }
}

// Singleton instance (opt-in start in server bootstrap)
export const intelligenceEvents = new IntelligenceEventAdapter();

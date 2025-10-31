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
          const payload = JSON.parse(value);
          const correlationId = payload?.correlation_id || payload?.correlationId;
          if (!correlationId) return;

          const pending = this.pending.get(correlationId);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(correlationId);

          if (topic === this.TOPIC_COMPLETED) {
            pending.resolve(payload);
          } else {
            pending.reject(new Error(payload?.error || 'Intelligence request failed'));
          }
        } catch (err) {
          // Swallow to avoid consumer crash; the caller gets timeout fallback
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
   * Generic request method
   */
  async request(requestType: string, payload: Record<string, any>, timeoutMs: number = 5000): Promise<any> {
    if (!this.started || !this.producer) throw new Error('IntelligenceEventAdapter not started');

    const correlationId = (payload?.correlation_id || payload?.correlationId || randomUUID()).toUpperCase();
    const envelope = {
      correlation_id: correlationId,
      request_type: requestType,
      timestamp: new Date().toISOString(),
      payload,
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
   * Example higher-level operation
   */
  async requestPatternDiscovery(params: { sourcePath: string; language?: string; project?: string }, timeoutMs?: number) {
    return this.request('code_analysis', params, timeoutMs);
  }
}

// Singleton instance (opt-in start in server bootstrap)
export const intelligenceEvents = new IntelligenceEventAdapter();

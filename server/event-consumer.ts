import { Kafka, Consumer } from 'kafkajs';
import { EventEmitter } from 'events';
import { getIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const RETRY_BASE_DELAY_MS = isTestEnv ? 20 : 1000;
const RETRY_MAX_DELAY_MS = isTestEnv ? 200 : 30000;

export interface AgentMetrics {
  agent: string;
  totalRequests: number;
  successRate: number | null;
  avgRoutingTime: number;
  avgConfidence: number;
  lastSeen: Date;
}

export interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails?: any;
  debugMode?: boolean;
  durationMs: number;
  createdAt: Date;
}

export interface RoutingDecision {
  id: string;
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  routingStrategy: string;
  alternatives?: any;
  reasoning?: string;
  routingTimeMs: number;
  createdAt: Date;
}

export interface TransformationEvent {
  id: string;
  correlationId: string;
  sourceAgent: string;
  targetAgent: string;
  transformationDurationMs: number;
  success: boolean;
  confidenceScore: number;
  createdAt: Date;
}

/**
 * EventConsumer class for aggregating Kafka events and emitting updates
 *
 * Events emitted:
 * - 'metricUpdate': When agent metrics are updated (AgentMetrics[])
 * - 'actionUpdate': When new agent action arrives (AgentAction)
 * - 'routingUpdate': When new routing decision arrives (RoutingDecision)
 * - 'transformationUpdate': When new transformation event arrives (TransformationEvent)
 * - 'performanceUpdate': When new performance metric arrives (metric, stats)
 * - 'error': When error occurs during processing (Error)
 * - 'connected': When consumer successfully connects
 * - 'disconnected': When consumer disconnects
 */
export class EventConsumer extends EventEmitter {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning = false;

  // Data retention configuration
  private readonly DATA_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private pruneTimer?: NodeJS.Timeout;

  // In-memory aggregations
  private agentMetrics = new Map<
    string,
    {
      count: number;
      totalRoutingTime: number;
      totalConfidence: number;
      successCount: number;
      errorCount: number;
      lastSeen: Date;
    }
  >();

  private recentActions: AgentAction[] = [];
  private maxActions = 100;

  private routingDecisions: RoutingDecision[] = [];
  private maxDecisions = 100;

  private recentTransformations: TransformationEvent[] = [];
  private maxTransformations = 100;

  // Performance metrics storage
  private performanceMetrics: Array<{
    id: string;
    correlationId: string;
    queryText: string;
    routingDurationMs: number;
    cacheHit: boolean;
    candidatesEvaluated: number;
    triggerMatchStrategy: string;
    createdAt: Date;
  }> = [];

  // Aggregated stats for quick access
  private performanceStats = {
    totalQueries: 0,
    cacheHitCount: 0,
    avgRoutingDuration: 0,
    totalRoutingDuration: 0,
  };

  constructor() {
    super(); // Initialize EventEmitter

    // Get brokers from environment variable - required, no fallback
    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;
    if (!brokers) {
      throw new Error(
        'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required. ' +
          'Set it in .env file or export it before starting the server. ' +
          'Example: KAFKA_BROKERS=192.168.86.200:29092'
      );
    }

    this.kafka = new Kafka({
      brokers: brokers.split(','),
      clientId: 'omnidash-event-consumer',
    });

    this.consumer = this.kafka.consumer({
      groupId: 'omnidash-consumers-v2', // Changed to force reading from beginning
    });
  }

  /**
   * Validate Kafka broker reachability before starting consumer
   * @returns Promise<boolean> - true if broker is reachable, false otherwise
   */
  async validateConnection(): Promise<boolean> {
    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;

    if (!brokers) {
      console.warn('⚠️  KAFKA_BROKERS not configured - real-time event streaming disabled');
      return false;
    }

    try {
      console.log(`🔍 Validating Kafka broker connection: ${brokers}`);

      const admin = this.kafka.admin();
      await admin.connect();

      // Quick health check - list topics to verify connectivity
      const topics = await admin.listTopics();
      console.log(`✅ Kafka broker reachable: ${brokers} (${topics.length} topics available)`);

      await admin.disconnect();
      return true;
    } catch (error) {
      console.error(`❌ Kafka broker unreachable: ${brokers}`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('   Real-time event streaming will be disabled');
      console.error('   Verify KAFKA_BROKERS configuration and network connectivity');
      return false;
    }
  }

  /**
   * Connect to Kafka with exponential backoff retry logic
   * @param maxRetries - Maximum number of retry attempts (default: 5)
   */
  async connectWithRetry(maxRetries = 5): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.consumer.connect();
        console.log('✅ Kafka consumer connected successfully');
        return;
      } catch (error) {
        const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
        const remaining = maxRetries - attempt - 1;

        if (remaining > 0) {
          console.warn(`⚠️ Kafka connection failed (attempt ${attempt + 1}/${maxRetries})`);
          console.warn(`   Error: ${error instanceof Error ? error.message : String(error)}`);
          console.warn(`   Retrying in ${delay}ms... (${remaining} attempts remaining)`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error('❌ Kafka consumer failed after max retries');
          console.error(
            `   Final error: ${error instanceof Error ? error.message : String(error)}`
          );
          throw new Error(
            `Kafka connection failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  async start() {
    if (this.isRunning || !this.consumer) {
      console.log('Event consumer already running or not initialized');
      return;
    }

    try {
      await this.connectWithRetry();
      console.log('Kafka consumer connected');
      this.emit('connected'); // Emit connected event

      // Preload historical data from PostgreSQL to populate dashboards on startup
      if (process.env.ENABLE_EVENT_PRELOAD !== 'false') {
        try {
          await this.preloadFromDatabase();
          console.log('[EventConsumer] Preloaded historical data from PostgreSQL');
        } catch (e) {
          console.warn('[EventConsumer] Preload skipped due to error:', e);
        }
      }

      await this.consumer.subscribe({
        topics: [
          'agent-routing-decisions',
          'agent-transformation-events',
          'router-performance-metrics',
          'agent-actions',
        ],
        fromBeginning: true, // Reprocess historical events to populate metrics
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const event = JSON.parse(message.value?.toString() || '{}');
            console.log(`[EventConsumer] Received event from topic: ${topic}`);

            switch (topic) {
              case 'agent-routing-decisions':
                console.log(
                  `[EventConsumer] Processing routing decision for agent: ${event.selected_agent || event.selectedAgent}`
                );
                this.handleRoutingDecision(event);
                break;
              case 'agent-actions':
                console.log(
                  `[EventConsumer] Processing action: ${event.action_type || event.actionType} from ${event.agent_name || event.agentName}`
                );
                this.handleAgentAction(event);
                break;
              case 'agent-transformation-events':
                console.log(
                  `[EventConsumer] Processing transformation: ${event.source_agent || event.sourceAgent} → ${event.target_agent || event.targetAgent}`
                );
                this.handleTransformationEvent(event);
                break;
              case 'router-performance-metrics':
                console.log(
                  `[EventConsumer] Processing performance metric: ${event.routing_duration_ms || event.routingDurationMs}ms`
                );
                this.handlePerformanceMetric(event);
                break;
            }
          } catch (error) {
            console.error('Error processing Kafka message:', error);
            this.emit('error', error); // Emit error event

            // If error suggests connection issue, attempt reconnection
            if (
              error instanceof Error &&
              (error.message.includes('connection') ||
                error.message.includes('broker') ||
                error.message.includes('network'))
            ) {
              console.warn('⚠️ Connection error detected, attempting reconnection...');
              try {
                await this.connectWithRetry();
                console.log('✅ Reconnection successful, resuming event processing');
              } catch (reconnectError) {
                console.error('❌ Reconnection failed:', reconnectError);
                this.emit('error', reconnectError);
              }
            }
          }
        },
      });

      this.isRunning = true;

      // Start periodic pruning to prevent unbounded memory growth
      this.pruneTimer = setInterval(() => {
        this.pruneOldData();
      }, this.PRUNE_INTERVAL_MS);

      console.log('✅ Event consumer started with automatic data pruning');
    } catch (error) {
      console.error('Failed to start event consumer:', error);
      this.emit('error', error); // Emit error event
      throw error;
    }
  }

  private async preloadFromDatabase() {
    try {
      // Load recent actions
      const actionsResult = await getIntelligenceDb().execute(
        sql.raw(`
        SELECT id, correlation_id, agent_name, action_type, action_name, action_details, debug_mode, duration_ms, created_at
        FROM agent_actions
        ORDER BY created_at DESC
        LIMIT 200;
      `)
      );

      // Handle different return types from Drizzle
      const actionsRows = Array.isArray(actionsResult)
        ? actionsResult
        : actionsResult?.rows || actionsResult || [];

      if (Array.isArray(actionsRows)) {
        actionsRows.forEach((r: any) => {
          const action = {
            id: r.id,
            correlationId: r.correlation_id,
            agentName: r.agent_name,
            actionType: r.action_type,
            actionName: r.action_name,
            actionDetails: r.action_details,
            debugMode: !!r.debug_mode,
            durationMs: Number(r.duration_ms || 0),
            createdAt: new Date(r.created_at),
          } as AgentAction;
          this.recentActions.push(action);
          if (this.recentActions.length > this.maxActions) {
            this.recentActions = this.recentActions.slice(-this.maxActions);
          }
        });
      }

      // Seed agent metrics using routing decisions + actions
      const metricsResult = await getIntelligenceDb().execute(
        sql.raw(`
        SELECT COALESCE(ard.selected_agent, aa.agent_name) AS agent,
               COUNT(aa.id) AS total_requests,
               AVG(COALESCE(ard.routing_time_ms, aa.duration_ms, 0)) AS avg_routing_time,
               AVG(COALESCE(ard.confidence_score, 0)) AS avg_confidence
        FROM agent_actions aa
        FULL OUTER JOIN agent_routing_decisions ard
          ON aa.correlation_id = ard.correlation_id
        WHERE (aa.created_at IS NULL OR aa.created_at >= NOW() - INTERVAL '24 hours')
           OR (ard.created_at IS NULL OR ard.created_at >= NOW() - INTERVAL '24 hours')
        GROUP BY COALESCE(ard.selected_agent, aa.agent_name)
        ORDER BY total_requests DESC
        LIMIT 100;
      `)
      );

      // Handle different return types from Drizzle
      const metricsRows = Array.isArray(metricsResult)
        ? metricsResult
        : metricsResult?.rows || metricsResult || [];

      if (Array.isArray(metricsRows)) {
        metricsRows.forEach((r: any) => {
          const agent = r.agent || 'unknown';
          this.agentMetrics.set(agent, {
            count: Number(r.total_requests || 0),
            totalRoutingTime: Number(r.avg_routing_time || 0) * Number(r.total_requests || 0),
            totalConfidence: Number(r.avg_confidence || 0) * Number(r.total_requests || 0),
            successCount: 0,
            errorCount: 0,
            lastSeen: new Date(),
          });
        });
      }

      // Emit initial metric snapshot
      this.emit('metricUpdate', this.getAgentMetrics());
      // Emit initial actions snapshot (emit last one to trigger UI refresh)
      const last = this.recentActions[this.recentActions.length - 1];
      if (last) this.emit('actionUpdate', last);
    } catch (error) {
      console.error('[EventConsumer] Error during preloadFromDatabase:', error);
      // Don't throw - allow server to continue even if preload fails
    }
  }

  private handleRoutingDecision(event: any) {
    const agent = event.selected_agent || event.selectedAgent;
    if (!agent) {
      console.warn('[EventConsumer] Routing decision missing agent name, skipping');
      return;
    }

    const existing = this.agentMetrics.get(agent) || {
      count: 0,
      totalRoutingTime: 0,
      totalConfidence: 0,
      successCount: 0,
      errorCount: 0,
      lastSeen: new Date(),
    };

    existing.count++;
    existing.totalRoutingTime += event.routing_time_ms || event.routingTimeMs || 0;
    existing.totalConfidence += event.confidence_score || event.confidenceScore || 0;
    existing.lastSeen = new Date();

    this.agentMetrics.set(agent, existing);
    console.log(
      `[EventConsumer] Updated metrics for ${agent}: ${existing.count} requests, avg confidence ${(existing.totalConfidence / existing.count).toFixed(2)}`
    );

    // Cleanup old entries (older than 24h)
    this.cleanupOldMetrics();

    // Emit update event for WebSocket broadcast
    this.emit('metricUpdate', this.getAgentMetrics());

    // Store routing decision
    const decision: RoutingDecision = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId,
      userRequest: event.user_request || event.userRequest || '',
      selectedAgent: agent,
      confidenceScore: event.confidence_score || event.confidenceScore || 0,
      routingStrategy: event.routing_strategy || event.routingStrategy || '',
      alternatives: event.alternatives,
      reasoning: event.reasoning,
      routingTimeMs: event.routing_time_ms || event.routingTimeMs || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.routingDecisions.unshift(decision);

    // Keep only last N decisions
    if (this.routingDecisions.length > this.maxDecisions) {
      this.routingDecisions = this.routingDecisions.slice(0, this.maxDecisions);
    }

    // Emit routing update
    this.emit('routingUpdate', decision);
  }

  private handleAgentAction(event: any) {
    const action: AgentAction = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId,
      agentName: event.agent_name || event.agentName,
      actionType: event.action_type || event.actionType,
      actionName: event.action_name || event.actionName,
      actionDetails: event.action_details || event.actionDetails,
      debugMode: event.debug_mode || event.debugMode,
      durationMs: event.duration_ms || event.durationMs || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.recentActions.unshift(action);
    console.log(
      `[EventConsumer] Added action to queue: ${action.actionName} (${action.agentName}), queue size: ${this.recentActions.length}`
    );

    // Track success/error rates per agent
    if (action.agentName && (action.actionType === 'success' || action.actionType === 'error')) {
      const existing = this.agentMetrics.get(action.agentName) || {
        count: 0,
        totalRoutingTime: 0,
        totalConfidence: 0,
        successCount: 0,
        errorCount: 0,
        lastSeen: new Date(),
      };

      if (action.actionType === 'success') {
        existing.successCount++;
      } else if (action.actionType === 'error') {
        existing.errorCount++;
      }

      existing.lastSeen = new Date();
      this.agentMetrics.set(action.agentName, existing);

      console.log(
        `[EventConsumer] Updated ${action.agentName} success/error: ${existing.successCount}/${existing.errorCount}`
      );

      // Emit metric update since success rate changed
      this.emit('metricUpdate', this.getAgentMetrics());
    }

    // Keep only last N actions
    if (this.recentActions.length > this.maxActions) {
      this.recentActions = this.recentActions.slice(0, this.maxActions);
    }

    // Emit update event for WebSocket broadcast
    this.emit('actionUpdate', action);
  }

  private handleTransformationEvent(event: any) {
    const transformation: TransformationEvent = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId,
      sourceAgent: event.source_agent || event.sourceAgent,
      targetAgent: event.target_agent || event.targetAgent,
      transformationDurationMs:
        event.transformation_duration_ms || event.transformationDurationMs || 0,
      success: event.success ?? true,
      confidenceScore: event.confidence_score || event.confidenceScore || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.recentTransformations.unshift(transformation);
    console.log(
      `[EventConsumer] Added transformation to queue: ${transformation.sourceAgent} → ${transformation.targetAgent}, queue size: ${this.recentTransformations.length}`
    );

    // Keep only last N transformations
    if (this.recentTransformations.length > this.maxTransformations) {
      this.recentTransformations = this.recentTransformations.slice(0, this.maxTransformations);
    }

    // Emit update event for WebSocket broadcast
    this.emit('transformationUpdate', transformation);
  }

  private handlePerformanceMetric(event: any): void {
    try {
      const metric = {
        id: event.id || crypto.randomUUID(),
        correlationId: event.correlation_id || event.correlationId,
        queryText: event.query_text || event.queryText || '',
        routingDurationMs: event.routing_duration_ms || event.routingDurationMs || 0,
        cacheHit: event.cache_hit ?? event.cacheHit ?? false,
        candidatesEvaluated: event.candidates_evaluated || event.candidatesEvaluated || 0,
        triggerMatchStrategy:
          event.trigger_match_strategy || event.triggerMatchStrategy || 'unknown',
        createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
      };

      // Store in memory (limit to 200 recent)
      this.performanceMetrics.unshift(metric);
      if (this.performanceMetrics.length > 200) {
        this.performanceMetrics = this.performanceMetrics.slice(0, 200);
      }

      // Update aggregated stats
      this.performanceStats.totalQueries++;
      if (metric.cacheHit) {
        this.performanceStats.cacheHitCount++;
      }
      this.performanceStats.totalRoutingDuration += metric.routingDurationMs;
      this.performanceStats.avgRoutingDuration =
        this.performanceStats.totalRoutingDuration / this.performanceStats.totalQueries;

      // Emit for WebSocket broadcast
      this.emit('performanceUpdate', {
        metric,
        stats: { ...this.performanceStats },
      });

      console.log(
        `[EventConsumer] Processed performance metric: ${metric.routingDurationMs}ms, cache hit: ${metric.cacheHit}, strategy: ${metric.triggerMatchStrategy}`
      );
    } catch (error) {
      console.error('[EventConsumer] Error processing performance metric:', error);
    }
  }

  private cleanupOldMetrics() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const entries = Array.from(this.agentMetrics.entries());
    for (const [agent, metrics] of entries) {
      if (metrics.lastSeen < cutoff) {
        this.agentMetrics.delete(agent);
      }
    }
  }

  /**
   * Prune old data from in-memory arrays to prevent unbounded memory growth
   * Removes events older than DATA_RETENTION_MS (24 hours by default)
   */
  private pruneOldData(): void {
    const cutoff = Date.now() - this.DATA_RETENTION_MS;

    // Prune recent actions
    const actionsBefore = this.recentActions.length;
    this.recentActions = this.recentActions.filter((action) => {
      const timestamp = new Date(action.createdAt).getTime();
      return timestamp > cutoff;
    });
    const actionsRemoved = actionsBefore - this.recentActions.length;

    // Prune routing decisions
    const decisionsBefore = this.routingDecisions.length;
    this.routingDecisions = this.routingDecisions.filter((decision) => {
      const timestamp = new Date(decision.createdAt).getTime();
      return timestamp > cutoff;
    });
    const decisionsRemoved = decisionsBefore - this.routingDecisions.length;

    // Prune transformations
    const transformationsBefore = this.recentTransformations.length;
    this.recentTransformations = this.recentTransformations.filter((transformation) => {
      const timestamp = new Date(transformation.createdAt).getTime();
      return timestamp > cutoff;
    });
    const transformationsRemoved = transformationsBefore - this.recentTransformations.length;

    // Prune performance metrics
    const metricsBefore = this.performanceMetrics.length;
    this.performanceMetrics = this.performanceMetrics.filter((metric) => {
      const timestamp = new Date(metric.createdAt).getTime();
      return timestamp > cutoff;
    });
    const metricsRemoved = metricsBefore - this.performanceMetrics.length;

    // Log pruning statistics if anything was removed
    const totalRemoved =
      actionsRemoved + decisionsRemoved + transformationsRemoved + metricsRemoved;
    if (totalRemoved > 0) {
      console.log(
        `🧹 Pruned old data: ${actionsRemoved} actions, ${decisionsRemoved} decisions, ${transformationsRemoved} transformations, ${metricsRemoved} metrics (total: ${totalRemoved})`
      );
    }
  }

  // Public getters for API endpoints
  getAgentMetrics(): AgentMetrics[] {
    const now = new Date();
    // Extended window to show historical data (was 5 minutes, now 24 hours)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return (
      Array.from(this.agentMetrics.entries())
        // Filter to only agents active in last 24 hours
        .filter(([_, data]) => data.lastSeen >= twentyFourHoursAgo)
        .map(([agent, data]) => {
          // Calculate success rate if we have success/error events
          const totalOutcomes = data.successCount + data.errorCount;
          let successRate: number | null = null;

          if (totalOutcomes > 0) {
            // Use actual success/error tracking if available
            successRate = data.successCount / totalOutcomes;
          } else {
            // Fallback: Use confidence score as proxy for success rate
            // High confidence (>0.85) = likely successful routing
            const avgConfidence = data.totalConfidence / data.count;
            successRate = avgConfidence; // Direct mapping: 0.85 confidence = 85% success rate
          }

          return {
            agent,
            totalRequests: data.count,
            successRate,
            avgRoutingTime: data.totalRoutingTime / data.count,
            avgConfidence: data.totalConfidence / data.count,
            lastSeen: data.lastSeen,
          };
        })
    );
  }

  getRecentActions(limit?: number): AgentAction[] {
    if (limit && limit > 0) {
      return this.recentActions.slice(0, limit);
    }
    return this.recentActions;
  }

  getActionsByAgent(agentName: string, timeWindow: string = '1h'): AgentAction[] {
    // Parse time window
    let windowMs: number;
    switch (timeWindow) {
      case '1h':
        windowMs = 60 * 60 * 1000;
        break;
      case '24h':
        windowMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        windowMs = 60 * 60 * 1000; // Default to 1h
    }

    const since = new Date(Date.now() - windowMs);

    return this.recentActions.filter(
      (action) => action.agentName === agentName && action.createdAt >= since
    );
  }

  getRoutingDecisions(filters?: { agent?: string; minConfidence?: number }): RoutingDecision[] {
    let decisions = this.routingDecisions;

    if (filters?.agent) {
      decisions = decisions.filter((d) => d.selectedAgent === filters.agent);
    }

    if (filters?.minConfidence !== undefined) {
      decisions = decisions.filter((d) => d.confidenceScore >= filters.minConfidence!);
    }

    return decisions;
  }

  getRecentTransformations(limit: number = 50): TransformationEvent[] {
    return this.recentTransformations.slice(0, limit);
  }

  getPerformanceMetrics(limit: number = 100): Array<any> {
    return this.performanceMetrics.slice(0, limit);
  }

  getPerformanceStats() {
    return {
      ...this.performanceStats,
      cacheHitRate:
        this.performanceStats.totalQueries > 0
          ? (this.performanceStats.cacheHitCount / this.performanceStats.totalQueries) * 100
          : 0,
    };
  }

  getHealthStatus() {
    return {
      status: this.isRunning ? 'healthy' : 'unhealthy',
      eventsProcessed: this.agentMetrics.size,
      recentActionsCount: this.recentActions.length,
      timestamp: new Date().toISOString(),
    };
  }

  async stop() {
    if (!this.consumer || !this.isRunning) {
      return;
    }

    try {
      // Clear pruning timer
      if (this.pruneTimer) {
        clearInterval(this.pruneTimer);
        this.pruneTimer = undefined;
      }

      await this.consumer.disconnect();
      this.isRunning = false;
      console.log('✅ Event consumer stopped');
      this.emit('disconnected'); // Emit disconnected event
    } catch (error) {
      console.error('Error disconnecting Kafka consumer:', error);
      this.emit('error', error); // Emit error event
    }
  }
}

export const eventConsumer = new EventConsumer();

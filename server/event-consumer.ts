import { Kafka, Consumer } from 'kafkajs';
import { EventEmitter } from 'events';

export interface AgentMetrics {
  agent: string;
  totalRequests: number;
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

/**
 * EventConsumer class for aggregating Kafka events and emitting updates
 *
 * Events emitted:
 * - 'metricUpdate': When agent metrics are updated (AgentMetrics[])
 * - 'actionUpdate': When new agent action arrives (AgentAction)
 * - 'routingUpdate': When new routing decision arrives (RoutingDecision)
 * - 'error': When error occurs during processing (Error)
 * - 'connected': When consumer successfully connects
 * - 'disconnected': When consumer disconnects
 */
class EventConsumer extends EventEmitter {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning = false;

  // In-memory aggregations
  private agentMetrics = new Map<string, {
    count: number;
    totalRoutingTime: number;
    totalConfidence: number;
    lastSeen: Date;
  }>();

  private recentActions: AgentAction[] = [];
  private maxActions = 100;

  private routingDecisions: RoutingDecision[] = [];
  private maxDecisions = 100;

  constructor() {
    super(); // Initialize EventEmitter

    this.kafka = new Kafka({
      brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(','),
      clientId: 'omnidash-event-consumer',
    });

    this.consumer = this.kafka.consumer({
      groupId: 'omnidash-consumers',
    });
  }

  async start() {
    if (this.isRunning || !this.consumer) {
      console.log('Event consumer already running or not initialized');
      return;
    }

    try {
      await this.consumer.connect();
      console.log('Kafka consumer connected');
      this.emit('connected'); // Emit connected event

      await this.consumer.subscribe({
        topics: [
          'agent-routing-decisions',
          'agent-transformation-events',
          'router-performance-metrics',
          'agent-actions'
        ],
        fromBeginning: false, // Only new events
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const event = JSON.parse(message.value?.toString() || '{}');
            console.log(`[EventConsumer] Received event from topic: ${topic}`);

            switch (topic) {
              case 'agent-routing-decisions':
                console.log(`[EventConsumer] Processing routing decision for agent: ${event.selected_agent || event.selectedAgent}`);
                this.handleRoutingDecision(event);
                break;
              case 'agent-actions':
                console.log(`[EventConsumer] Processing action: ${event.action_type || event.actionType} from ${event.agent_name || event.agentName}`);
                this.handleAgentAction(event);
                break;
              case 'agent-transformation-events':
                console.log('[EventConsumer] Received transformation event (not yet implemented)');
                // Future: handle transformation events
                break;
              case 'router-performance-metrics':
                console.log('[EventConsumer] Received performance metric (not yet implemented)');
                // Future: handle performance metrics
                break;
            }
          } catch (error) {
            console.error('Error processing Kafka message:', error);
            this.emit('error', error); // Emit error event
          }
        },
      });

      this.isRunning = true;
      console.log('Event consumer started successfully');
    } catch (error) {
      console.error('Failed to start event consumer:', error);
      this.emit('error', error); // Emit error event
      throw error;
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
      lastSeen: new Date(),
    };

    existing.count++;
    existing.totalRoutingTime += event.routing_time_ms || event.routingTimeMs || 0;
    existing.totalConfidence += event.confidence_score || event.confidenceScore || 0;
    existing.lastSeen = new Date();

    this.agentMetrics.set(agent, existing);
    console.log(`[EventConsumer] Updated metrics for ${agent}: ${existing.count} requests, avg confidence ${(existing.totalConfidence / existing.count).toFixed(2)}`);

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
    console.log(`[EventConsumer] Added action to queue: ${action.actionName} (${action.agentName}), queue size: ${this.recentActions.length}`);

    // Keep only last N actions
    if (this.recentActions.length > this.maxActions) {
      this.recentActions = this.recentActions.slice(0, this.maxActions);
    }

    // Emit update event for WebSocket broadcast
    this.emit('actionUpdate', action);
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

  // Public getters for API endpoints
  getAgentMetrics(): AgentMetrics[] {
    return Array.from(this.agentMetrics.entries()).map(([agent, data]) => ({
      agent,
      totalRequests: data.count,
      avgRoutingTime: data.totalRoutingTime / data.count,
      avgConfidence: data.totalConfidence / data.count,
      lastSeen: data.lastSeen,
    }));
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
      action => action.agentName === agentName && action.createdAt >= since
    );
  }

  getRoutingDecisions(filters?: {
    agent?: string;
    minConfidence?: number;
  }): RoutingDecision[] {
    let decisions = this.routingDecisions;

    if (filters?.agent) {
      decisions = decisions.filter(d => d.selectedAgent === filters.agent);
    }

    if (filters?.minConfidence !== undefined) {
      decisions = decisions.filter(d => d.confidenceScore >= filters.minConfidence!);
    }

    return decisions;
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
      await this.consumer.disconnect();
      this.isRunning = false;
      console.log('Kafka consumer disconnected');
      this.emit('disconnected'); // Emit disconnected event
    } catch (error) {
      console.error('Error disconnecting Kafka consumer:', error);
      this.emit('error', error); // Emit error event
    }
  }
}

export const eventConsumer = new EventConsumer();

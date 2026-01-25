/**
 * Registry Mock Data Generator
 *
 * Generates realistic mock data for the ONEX Node Registry Discovery API.
 * Used for development and testing before connecting to the real FastAPI infra service.
 */

import { randomUUID } from 'crypto';
import type {
  NodeType,
  RegistrationState,
  HealthStatus,
  RegistryNodeView,
  RegistryInstanceView,
  RegistrySummary,
  RegistryWidgetMapping,
  RegistryNodeQueryParams,
  RegistryInstanceQueryParams,
} from '@shared/registry-types';

// ============================================================================
// Mock Node Definitions
// ============================================================================

interface MockNodeDefinition {
  name: string;
  service_name: string;
  display_name: string;
  node_type: NodeType;
  version: string;
  capabilities: string[];
  namespace: string | null;
}

const MOCK_NODE_DEFINITIONS: MockNodeDefinition[] = [
  // Effect Nodes - External I/O operations
  {
    name: 'node_kafka_producer_effect',
    service_name: 'onex-kafka-producer',
    display_name: 'Kafka Producer',
    node_type: 'EFFECT',
    version: '1.2.0',
    capabilities: ['kafka_publish', 'event_streaming', 'async_messaging'],
    namespace: 'messaging',
  },
  {
    name: 'node_postgres_query_effect',
    service_name: 'onex-postgres-adapter',
    display_name: 'PostgreSQL Adapter',
    node_type: 'EFFECT',
    version: '1.1.0',
    capabilities: ['sql_query', 'database_read', 'database_write', 'transaction'],
    namespace: 'data',
  },
  {
    name: 'node_consul_registry_effect',
    service_name: 'onex-consul-adapter',
    display_name: 'Consul Service Registry',
    node_type: 'EFFECT',
    version: '1.0.0',
    capabilities: ['service_discovery', 'health_check', 'kv_store'],
    namespace: 'infrastructure',
  },
  {
    name: 'node_http_client_effect',
    service_name: 'onex-http-client',
    display_name: 'HTTP Client',
    node_type: 'EFFECT',
    version: '2.0.0',
    capabilities: ['http_request', 'rest_api', 'webhook'],
    namespace: 'network',
  },

  // Compute Nodes - Pure transformations
  {
    name: 'node_contract_validator_compute',
    service_name: 'onex-contract-validator',
    display_name: 'Contract Validator',
    node_type: 'COMPUTE',
    version: '1.3.0',
    capabilities: ['schema_validation', 'type_checking', 'contract_enforcement'],
    namespace: 'validation',
  },
  {
    name: 'node_json_transformer_compute',
    service_name: 'onex-json-transformer',
    display_name: 'JSON Transformer',
    node_type: 'COMPUTE',
    version: '1.0.0',
    capabilities: ['json_transform', 'data_mapping', 'field_extraction'],
    namespace: 'transform',
  },
  {
    name: 'node_semantic_router_compute',
    service_name: 'onex-semantic-router',
    display_name: 'Semantic Router',
    node_type: 'COMPUTE',
    version: '1.5.0',
    capabilities: ['semantic_similarity', 'embedding_comparison', 'routing_decision'],
    namespace: 'routing',
  },
  // Omnidash Dashboard - Self-referential entry (OMN-1280)
  {
    name: 'OmnidashDashboard',
    service_name: 'omnidash-dashboard',
    display_name: 'Omnidash Dashboard',
    node_type: 'SERVICE',
    version: '1.0.0',
    capabilities: ['dashboard_rendering', 'real_time_events', 'intelligence_query'],
    namespace: 'observability',
  },

  // Reducer Nodes - Aggregation and persistence
  {
    name: 'node_metrics_aggregator_reducer',
    service_name: 'onex-metrics-aggregator',
    display_name: 'Metrics Aggregator',
    node_type: 'REDUCER',
    version: '1.1.0',
    capabilities: ['metric_aggregation', 'time_series', 'statistical_summary'],
    namespace: 'observability',
  },
  {
    name: 'node_event_store_reducer',
    service_name: 'onex-event-store',
    display_name: 'Event Store',
    node_type: 'REDUCER',
    version: '2.0.0',
    capabilities: ['event_sourcing', 'event_replay', 'snapshot'],
    namespace: 'data',
  },

  // Orchestrator Nodes - Workflow coordination
  {
    name: 'node_agent_orchestrator_orchestrator',
    service_name: 'onex-agent-orchestrator',
    display_name: 'Agent Orchestrator',
    node_type: 'ORCHESTRATOR',
    version: '1.4.0',
    capabilities: ['agent_coordination', 'workflow_execution', 'parallel_dispatch'],
    namespace: 'agents',
  },
  {
    name: 'node_pipeline_orchestrator_orchestrator',
    service_name: 'onex-pipeline-orchestrator',
    display_name: 'Pipeline Orchestrator',
    node_type: 'ORCHESTRATOR',
    version: '1.2.0',
    capabilities: ['pipeline_execution', 'step_coordination', 'dependency_resolution'],
    namespace: 'workflows',
  },
  {
    name: 'node_batch_processor_orchestrator',
    service_name: 'onex-batch-processor',
    display_name: 'Batch Processor',
    node_type: 'ORCHESTRATOR',
    version: '1.0.0',
    capabilities: ['batch_processing', 'job_scheduling', 'retry_logic'],
    namespace: 'processing',
  },
];

// State distribution weights for realistic mock data
const STATE_WEIGHTS: { state: RegistrationState; weight: number }[] = [
  { state: 'ACTIVE', weight: 0.7 },
  { state: 'ACK_RECEIVED', weight: 0.1 },
  { state: 'AWAITING_ACK', weight: 0.05 },
  { state: 'PENDING_REGISTRATION', weight: 0.05 },
  { state: 'ACCEPTED', weight: 0.03 },
  { state: 'LIVENESS_EXPIRED', weight: 0.04 },
  { state: 'ACK_TIMED_OUT', weight: 0.02 },
  { state: 'REJECTED', weight: 0.01 },
];

// Health status distribution weights
const HEALTH_WEIGHTS: { status: HealthStatus; weight: number }[] = [
  { status: 'passing', weight: 0.8 },
  { status: 'warning', weight: 0.12 },
  { status: 'critical', weight: 0.05 },
  { status: 'unknown', weight: 0.03 },
];

// ============================================================================
// Utility Functions
// ============================================================================

function weightedRandom<T>(items: { value: T; weight: number }[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item.weight;
    if (random <= 0) {
      return item.value;
    }
  }

  return items[items.length - 1].value;
}

function getRandomState(): RegistrationState {
  return weightedRandom(STATE_WEIGHTS.map((w) => ({ value: w.state, weight: w.weight })));
}

function getRandomHealthStatus(): HealthStatus {
  return weightedRandom(HEALTH_WEIGHTS.map((w) => ({ value: w.status, weight: w.weight })));
}

function getRandomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.random() * daysAgo);
  return date.toISOString();
}

function getRecentDate(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - Math.floor(Math.random() * 30));
  return date.toISOString();
}

// ============================================================================
// Mock Data Store (Singleton with Lazy Initialization)
// ============================================================================

/**
 * MockDataStore provides in-memory caching for mock registry data.
 * Data is generated once on first access and reused for subsequent requests.
 * Use refresh() to regenerate all data for testing/demos.
 */
class MockDataStore {
  private nodes: RegistryNodeView[] | null = null;
  private instances: RegistryInstanceView[] | null = null;
  private lastRefresh: Date | null = null;

  /**
   * Get cached nodes (generates on first access)
   */
  getNodes(): RegistryNodeView[] {
    if (!this.nodes) {
      this.nodes = this.generateNodes();
      this.lastRefresh = new Date();
    }
    // Update heartbeat times for freshness on active nodes
    return this.nodes.map((node) => ({
      ...node,
      last_heartbeat_at: node.state === 'ACTIVE' ? getRecentDate() : node.last_heartbeat_at,
    }));
  }

  /**
   * Get cached instances (generates on first access)
   */
  getInstances(): RegistryInstanceView[] {
    // Ensure nodes are generated first
    const nodes = this.getNodes();

    if (!this.instances) {
      this.instances = this.generateInstances(nodes);
    }
    // Update check times for freshness
    return this.instances.map((instance) => ({
      ...instance,
      last_check_at:
        instance.health_status !== 'unknown' ? getRecentDate() : instance.last_check_at,
    }));
  }

  /**
   * Compute summary from cached data
   */
  getSummary(): RegistrySummary {
    const nodes = this.getNodes();
    const instances = this.getInstances();
    return computeSummary(nodes, instances);
  }

  /**
   * Regenerate all mock data (for testing/demos)
   */
  refresh(): void {
    this.nodes = this.generateNodes();
    this.instances = this.generateInstances(this.nodes);
    this.lastRefresh = new Date();
  }

  /**
   * Check if data has been initialized
   */
  isInitialized(): boolean {
    return this.nodes !== null;
  }

  /**
   * Get timestamp of last refresh
   */
  getLastRefresh(): Date | null {
    return this.lastRefresh;
  }

  /**
   * Generate nodes from definitions (internal)
   */
  private generateNodes(): RegistryNodeView[] {
    return MOCK_NODE_DEFINITIONS.map((def) => {
      const nodeId = randomUUID();
      const state = getRandomState();

      return {
        node_id: nodeId,
        name: def.name,
        service_name: def.service_name,
        namespace: def.namespace,
        display_name: def.display_name,
        node_type: def.node_type,
        version: def.version,
        state,
        capabilities: def.capabilities,
        registered_at: getRandomDate(30),
        last_heartbeat_at: state === 'ACTIVE' ? getRecentDate() : null,
      };
    });
  }

  /**
   * Generate instances for nodes (internal)
   */
  private generateInstances(nodes: RegistryNodeView[]): RegistryInstanceView[] {
    const instances: RegistryInstanceView[] = [];

    for (const node of nodes) {
      // Only active or partially active nodes have instances
      if (['ACTIVE', 'ACK_RECEIVED', 'AWAITING_ACK'].includes(node.state)) {
        // Generate 1-3 instances per node
        const instanceCount = 1 + Math.floor(Math.random() * 3);

        for (let i = 0; i < instanceCount; i++) {
          const healthStatus = getRandomHealthStatus();
          const port = 8000 + Math.floor(Math.random() * 1000);

          instances.push({
            node_id: node.node_id,
            service_name: node.service_name,
            service_id: `${node.service_name}-${i + 1}`,
            instance_id: randomUUID(),
            address: `192.168.1.${100 + Math.floor(Math.random() * 100)}`,
            port,
            health_status: healthStatus,
            health_output:
              healthStatus === 'passing'
                ? 'TCP connect succeeded'
                : healthStatus === 'warning'
                  ? 'High latency detected (>500ms)'
                  : healthStatus === 'critical'
                    ? 'Connection refused'
                    : null,
            last_check_at: healthStatus !== 'unknown' ? getRecentDate() : null,
            tags: [node.node_type.toLowerCase(), node.namespace || 'default', `v${node.version}`],
            meta: {
              node_type: node.node_type,
              version: node.version,
              namespace: node.namespace || 'default',
            },
          });
        }
      }
    }

    return instances;
  }
}

// Export singleton instance
export const mockDataStore = new MockDataStore();

// ============================================================================
// Legacy Functions (for backward compatibility)
// ============================================================================

/**
 * Generate mock nodes with consistent IDs (uses cached store)
 * @deprecated Use mockDataStore.getNodes() instead
 */
export function generateMockNodes(): RegistryNodeView[] {
  return mockDataStore.getNodes();
}

/**
 * Generate mock instances for nodes (uses cached store)
 * @deprecated Use mockDataStore.getInstances() instead
 */
export function generateMockInstances(_nodes: RegistryNodeView[]): RegistryInstanceView[] {
  return mockDataStore.getInstances();
}

// ============================================================================
// Summary Computation
// ============================================================================

/**
 * Compute summary statistics from nodes and instances
 */
function computeSummary(
  nodes: RegistryNodeView[],
  instances: RegistryInstanceView[]
): RegistrySummary {
  const byType: Record<NodeType, number> = {
    EFFECT: 0,
    COMPUTE: 0,
    REDUCER: 0,
    ORCHESTRATOR: 0,
    SERVICE: 0,
  };

  const byHealth: Record<HealthStatus, number> = {
    passing: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
  };

  let activeNodes = 0;
  let pendingNodes = 0;
  let failedNodes = 0;

  for (const node of nodes) {
    byType[node.node_type]++;

    if (node.state === 'ACTIVE') {
      activeNodes++;
    } else if (['PENDING_REGISTRATION', 'ACCEPTED', 'AWAITING_ACK'].includes(node.state)) {
      pendingNodes++;
    } else if (['ACK_TIMED_OUT', 'LIVENESS_EXPIRED', 'REJECTED'].includes(node.state)) {
      failedNodes++;
    }
  }

  for (const instance of instances) {
    byHealth[instance.health_status]++;
  }

  return {
    total_nodes: nodes.length,
    active_nodes: activeNodes,
    pending_nodes: pendingNodes,
    failed_nodes: failedNodes,
    unhealthy_instances: byHealth.critical + byHealth.warning,
    by_type: byType,
    by_health: byHealth,
  };
}

/**
 * Generate summary statistics from nodes and instances
 * @deprecated Use mockDataStore.getSummary() or computeSummary() directly
 */
export function generateMockSummary(
  nodes: RegistryNodeView[],
  instances: RegistryInstanceView[]
): RegistrySummary {
  return computeSummary(nodes, instances);
}

/**
 * Filter nodes based on query parameters
 */
export function filterNodes(
  nodes: RegistryNodeView[],
  params: RegistryNodeQueryParams
): { nodes: RegistryNodeView[]; total: number } {
  let filtered = [...nodes];
  const total = filtered.length;

  // Filter by state
  if (params.state) {
    filtered = filtered.filter((n) => n.state === params.state);
  }

  // Filter by type
  if (params.type) {
    filtered = filtered.filter((n) => n.node_type === params.type);
  }

  // Filter by capability
  if (params.capability) {
    filtered = filtered.filter((n) => n.capabilities.includes(params.capability as string));
  }

  // Filter by namespace
  if (params.namespace) {
    filtered = filtered.filter((n) => n.namespace === params.namespace);
  }

  // Filter by search term
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = filtered.filter(
      (n) =>
        n.name.toLowerCase().includes(searchLower) ||
        n.display_name?.toLowerCase().includes(searchLower) ||
        n.service_name.toLowerCase().includes(searchLower)
    );
  }

  // Apply pagination
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    nodes: paginated,
    total: filtered.length,
  };
}

/**
 * Filter instances based on query parameters
 */
export function filterInstances(
  instances: RegistryInstanceView[],
  params: RegistryInstanceQueryParams
): { instances: RegistryInstanceView[]; total: number } {
  let filtered = [...instances];

  // Filter by node_id
  if (params.node_id) {
    filtered = filtered.filter((i) => i.node_id === params.node_id);
  }

  // Filter by service_name
  if (params.service_name) {
    filtered = filtered.filter((i) => i.service_name === params.service_name);
  }

  // Filter by health_status
  if (params.health_status) {
    filtered = filtered.filter((i) => i.health_status === params.health_status);
  }

  // Apply pagination
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    instances: paginated,
    total: filtered.length,
  };
}

/**
 * Get widget mapping configuration (static)
 */
export function getWidgetMappings(): RegistryWidgetMapping[] {
  return [
    {
      capability: 'kafka_publish',
      widget_type: 'event_stream',
      description: 'Real-time event stream visualization',
      default_config: { refreshInterval: 5000, maxEvents: 100 },
    },
    {
      capability: 'sql_query',
      widget_type: 'query_metrics',
      description: 'Database query performance metrics',
      default_config: { showLatency: true, showThroughput: true },
    },
    {
      capability: 'service_discovery',
      widget_type: 'service_topology',
      description: 'Service topology and health map',
      default_config: { layout: 'hierarchical', showHealth: true },
    },
    {
      capability: 'semantic_similarity',
      widget_type: 'similarity_matrix',
      description: 'Semantic similarity visualization',
      default_config: { colorScale: 'viridis', threshold: 0.7 },
    },
    {
      capability: 'metric_aggregation',
      widget_type: 'time_series_chart',
      description: 'Time series metric visualization',
      default_config: { aggregation: '5m', showTrend: true },
    },
    {
      capability: 'workflow_execution',
      widget_type: 'workflow_dag',
      description: 'Workflow DAG visualization',
      default_config: { showStatus: true, enableZoom: true },
    },
    {
      capability: 'agent_coordination',
      widget_type: 'agent_network',
      description: 'Agent coordination network graph',
      default_config: { showConnections: true, highlightActive: true },
    },
    {
      capability: 'health_check',
      widget_type: 'health_matrix',
      description: 'Service health status matrix',
      default_config: { groupBy: 'namespace', showHistory: true },
    },
  ];
}

/**
 * Reset cached data (useful for testing)
 * @deprecated Use mockDataStore.refresh() instead
 */
export function resetMockData(): void {
  mockDataStore.refresh();
}

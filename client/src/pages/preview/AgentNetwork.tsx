import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentNetworkSource } from '@/lib/data-sources';
import { getPollingInterval } from '@/lib/constants/query-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MockDataBadge } from '@/components/MockDataBadge';
import { UnifiedGraph, type GraphNode, type GraphEdge } from '@/components/UnifiedGraph';
import {
  Network,
  Search,
  Filter,
  Eye,
  Bot,
  Layers,
  Code,
  TestTube,
  Server,
  Workflow,
  BookOpen,
  Activity,
} from 'lucide-react';

interface AgentNode {
  id: string;
  name: string;
  title: string;
  category: string;
  color: string;
  x: number;
  y: number;
  size: number;
  connections: string[];
  performance: {
    successRate: number;
    efficiency: number;
    totalRuns: number;
  };
}

interface AgentConnection {
  from: string;
  to: string;
  strength: number;
  type: 'routing'; // Only routing connections exist in reality
}

export default function AgentNetwork() {
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use centralized data source
  const { data: networkData, isLoading: queryLoading } = useQuery({
    queryKey: ['agent-network'],
    queryFn: () => agentNetworkSource.fetchAll(),
    refetchInterval: getPollingInterval(60000),
  });

  const agentsData = networkData?.agents;
  const routingData = networkData?.routingDecisions;

  // Build network graph from live data
  useEffect(() => {
    if (queryLoading) {
      setIsLoading(true);
      return;
    }

    // Use live data if available, otherwise fall back to mock
    const agents = agentsData || [];
    const usingMockData = agents.length === 0 || networkData?.isMock;

    if (usingMockData) {
      // Mock data fallback
      const mockNodes: AgentNode[] = [
        {
          id: 'agent-polymorphic-agent',
          name: 'agent-polymorphic-agent',
          title: 'Polymorphic Agent (Polly)',
          category: 'coordination',
          color: 'purple',
          x: 400,
          y: 200,
          size: 80,
          connections: [
            'agent-api-architect',
            'agent-debug-intelligence',
            'agent-frontend-developer',
            'agent-performance',
            'agent-testing',
          ],
          performance: { successRate: 88.9, efficiency: 85, totalRuns: 3456 },
        },
        {
          id: 'agent-api-architect',
          name: 'agent-api-architect',
          title: 'API Architect',
          category: 'architecture',
          color: 'blue',
          x: 200,
          y: 100,
          size: 60,
          connections: ['agent-debug-intelligence', 'agent-performance'],
          performance: { successRate: 94.2, efficiency: 92, totalRuns: 1247 },
        },
        {
          id: 'agent-debug-intelligence',
          name: 'agent-debug-intelligence',
          title: 'Debug Intelligence',
          category: 'development',
          color: 'red',
          x: 200,
          y: 300,
          size: 70,
          connections: ['agent-performance', 'agent-testing'],
          performance: { successRate: 91.8, efficiency: 88, totalRuns: 2156 },
        },
        {
          id: 'agent-frontend-developer',
          name: 'agent-frontend-developer',
          title: 'Frontend Developer',
          category: 'development',
          color: 'cyan',
          x: 600,
          y: 100,
          size: 65,
          connections: ['agent-testing', 'agent-performance'],
          performance: { successRate: 96.4, efficiency: 94, totalRuns: 1892 },
        },
        {
          id: 'agent-performance',
          name: 'agent-performance',
          title: 'Performance Specialist',
          category: 'quality',
          color: 'green',
          x: 400,
          y: 400,
          size: 55,
          connections: ['agent-debug-intelligence', 'agent-testing'],
          performance: { successRate: 93.7, efficiency: 91, totalRuns: 1456 },
        },
        {
          id: 'agent-testing',
          name: 'agent-testing',
          title: 'Testing Specialist',
          category: 'quality',
          color: 'green',
          x: 600,
          y: 300,
          size: 60,
          connections: ['agent-debug-intelligence', 'agent-frontend-developer'],
          performance: { successRate: 95.2, efficiency: 89, totalRuns: 2034 },
        },
      ];

      // Only routing connections: Polly → Selected Agents (the truth!)
      const mockConnections: AgentConnection[] = [
        {
          from: 'agent-polymorphic-agent',
          to: 'agent-api-architect',
          strength: 0.9,
          type: 'routing',
        },
        {
          from: 'agent-polymorphic-agent',
          to: 'agent-debug-intelligence',
          strength: 0.8,
          type: 'routing',
        },
        {
          from: 'agent-polymorphic-agent',
          to: 'agent-frontend-developer',
          strength: 0.7,
          type: 'routing',
        },
        {
          from: 'agent-polymorphic-agent',
          to: 'agent-performance',
          strength: 0.6,
          type: 'routing',
        },
        { from: 'agent-polymorphic-agent', to: 'agent-testing', strength: 0.5, type: 'routing' },
      ];

      setNodes(mockNodes);
      setConnections(mockConnections);
      setIsLoading(false);
      return;
    }

    // Transform live agent data to nodes
    let nodes: AgentNode[] = agents.map((agent: any) => {
      return {
        id: agent.id || agent.name,
        name: agent.name || agent.id,
        title: agent.title || agent.name,
        category: agent.category || 'general',
        color: agent.color || 'blue',
        x: 0, // Will be calculated by UnifiedGraph
        y: 0, // Will be calculated by UnifiedGraph
        size: Math.max(40, Math.min(80, (agent.performance?.totalRuns || 0) / 50)),
        connections: [], // Will be populated from routing data
        performance: {
          successRate: Math.max(
            0,
            Math.min(
              100,
              (agent.performance?.successRate || 0) <= 1
                ? (agent.performance?.successRate || 0) * 100
                : agent.performance?.successRate || 0
            )
          ),
          efficiency: Math.max(
            0,
            Math.min(
              100,
              (agent.performance?.efficiency || 0) <= 1
                ? (agent.performance?.efficiency || 0) * 100
                : agent.performance?.efficiency || 0
            )
          ),
          totalRuns: agent.performance?.totalRuns || 0,
        },
      };
    });

    // Build connections from routing data
    const connections: AgentConnection[] = [];

    // Add routing connections from routing decisions
    if (Array.isArray(routingData) && routingData.length > 0) {
      routingData.forEach((decision: any) => {
        // Find polymorphic agent (usually the main coordinator)
        const polyAgent = nodes.find(
          (n) => n.name.includes('polymorphic') || n.name.includes('polly')
        );
        const targetAgent = nodes.find((n) => n.id === decision.agent || n.name === decision.agent);

        if (polyAgent && targetAgent && polyAgent.id !== targetAgent.id) {
          // Check if connection already exists
          const existing = connections.find(
            (c) => c.from === polyAgent.id && c.to === targetAgent.id
          );

          if (!existing) {
            connections.push({
              from: polyAgent.id,
              to: targetAgent.id,
              strength: decision.confidence / 100 || 0.7,
              type: 'routing',
            });
          }
        }
      });
    }

    // Update node connections list (only routing connections exist)
    nodes.forEach((node) => {
      node.connections = connections
        .filter((c) => c.from === node.id || c.to === node.id)
        .map((c) => (c.from === node.id ? c.to : c.from));
    });

    setNodes(nodes);
    setConnections(connections);
    setIsLoading(false);
  }, [agentsData, routingData, queryLoading, networkData?.isMock]);

  const usingMockData = networkData?.isMock || !agentsData || agentsData.length === 0;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'development':
        return Code;
      case 'architecture':
        return Layers;
      case 'quality':
        return TestTube;
      case 'infrastructure':
        return Server;
      case 'coordination':
        return Workflow;
      case 'documentation':
        return BookOpen;
      default:
        return Bot;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'development':
        return '#3B82F6';
      case 'architecture':
        return '#8B5CF6';
      case 'quality':
        return '#10B981';
      case 'infrastructure':
        return '#F59E0B';
      case 'coordination':
        return '#EC4899';
      case 'documentation':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  // Memoize custom layout for radial pattern: Polly in center, agents around it
  const customLayout = useMemo(() => {
    if (nodes.length === 0) return { type: 'circular' as const };

    // Find Polly (polymorphic agent) to place in center
    const polyIndex = nodes.findIndex(
      (n) => n.id.includes('polymorphic') || n.name.includes('polly')
    );

    if (polyIndex === -1) {
      // No Polly found, use standard circular layout
      return { type: 'circular' as const };
    }

    // Create custom positions with Polly in center
    const nodePositions: Record<string, { x: number; y: number }> = {};
    const centerX = 400; // Default center, UnifiedGraph will scale to container
    const centerY = 300;
    const radius = 200;

    nodes.forEach((node, i) => {
      if (i === polyIndex) {
        // Polly in center
        nodePositions[node.id] = { x: centerX, y: centerY };
      } else {
        // Other agents in circle around Polly
        const agentIndex = i < polyIndex ? i : i - 1;
        const totalAgents = nodes.length - 1;
        const angle = (agentIndex / totalAgents) * 2 * Math.PI - Math.PI / 2;
        nodePositions[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      }
    });

    return { type: 'custom' as const, nodePositions };
  }, [nodes]);

  // Memoize color scheme
  const graphColorScheme = useMemo(
    () => ({
      routing: '#8B5CF6',
      development: '#3B82F6',
      architecture: '#8B5CF6',
      quality: '#10B981',
      infrastructure: '#F59E0B',
      coordination: '#EC4899',
      documentation: '#6B7280',
    }),
    []
  );

  // Convert nodes to GraphNode format
  const graphNodes: GraphNode[] = useMemo(() => {
    return nodes.map((node) => ({
      id: node.id,
      label: node.title,
      type: node.category,
      size: node.size,
      color: getCategoryColor(node.category),
      metadata: {
        name: node.name,
        category: node.category,
        performance: node.performance,
        connections: node.connections,
      },
    }));
  }, [nodes]);

  // Convert connections to GraphEdge format
  const graphEdges: GraphEdge[] = useMemo(() => {
    return connections.map((conn) => ({
      source: conn.from,
      target: conn.to,
      weight: conn.strength,
      type: conn.type,
      label: undefined,
    }));
  }, [connections]);

  const handleNodeClick = (node: GraphNode) => {
    const agentNode = nodes.find((n) => n.id === node.id);
    setSelectedNode(agentNode || null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading agent network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Network</h1>
          <p className="text-muted-foreground">
            Visualize agent routing patterns. The graph shows the simple routing architecture:
            <strong> Polly (polymorphic-agent)</strong> receives user requests and routes them to
            specialized agents.
            <strong> Purple lines</strong> show routing decisions (which agent handles which
            requests).
          </p>
        </div>
        <div className="flex items-center gap-2">{usingMockData && <MockDataBadge />}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Network Visualization */}
        <div className="lg:col-span-3">
          <UnifiedGraph
            nodes={graphNodes}
            edges={graphEdges}
            layout={customLayout}
            height="600px"
            interactive={true}
            zoomable={false}
            showLegend={true}
            colorScheme={graphColorScheme}
            onNodeClick={handleNodeClick}
            title="Agent Network Graph"
            subtitle="Interactive visualization of agent relationships and dependencies"
          />

          {/* Agent Cards (standardized with Agent Management styling) */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
                <CardDescription>
                  Standardized agent cards for clarity and consistency
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {nodes.map((n) => (
                    <div
                      key={n.id}
                      className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-card"
                      onClick={() => setSelectedNode(n)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold leading-tight">{n.title}</div>
                            <div className="text-xs text-muted-foreground">{n.name}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {n.category}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">Success</div>
                          <div className="text-sm font-medium">
                            {Math.max(0, Math.min(100, n.performance.successRate)).toFixed(1)}%
                          </div>
                        </div>
                        <div className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">Efficiency</div>
                          <div className="text-sm font-medium">
                            {Math.max(0, Math.min(100, n.performance.efficiency)).toFixed(1)}%
                          </div>
                        </div>
                        <div className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">Runs</div>
                          <div className="text-sm font-medium">
                            {n.performance.totalRuns.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Agent Details */}
        <div className="space-y-4">
          {selectedNode ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  {selectedNode.title}
                </CardTitle>
                <CardDescription>{selectedNode.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-2">Category</div>
                  <Badge variant="outline" className="capitalize">
                    {selectedNode.category}
                  </Badge>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Performance</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Success Rate</span>
                      <span className="font-medium">
                        {Math.max(0, Math.min(100, selectedNode.performance.successRate)).toFixed(
                          1
                        )}
                        %
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Efficiency</span>
                      <span className="font-medium">
                        {Math.max(0, Math.min(100, selectedNode.performance.efficiency)).toFixed(1)}
                        %
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Runs</span>
                      <span className="font-medium">
                        {selectedNode.performance.totalRuns.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Connections</div>
                  <div className="space-y-1">
                    {selectedNode.connections.map((connectionId) => {
                      const connection = nodes.find((n) => n.id === connectionId);
                      if (!connection) return null;

                      const Icon = getCategoryIcon(connection.category);
                      return (
                        <div key={connectionId} className="flex items-center gap-2 text-sm">
                          <Icon className="w-4 h-4" />
                          <span>{connection.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Button className="w-full" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Network Overview</CardTitle>
                <CardDescription>Click on a node to view details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center text-sm text-muted-foreground">
                    <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Select an agent node to view its details and connections</p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Network Stats</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Total Agents</div>
                        <div className="font-medium">{nodes.length}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Connections</div>
                        <div className="font-medium">{connections.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Network Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Network Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full">
                <Filter className="w-4 h-4 mr-2" />
                Filter by Category
              </Button>
              <Button variant="outline" size="sm" className="w-full">
                <Search className="w-4 h-4 mr-2" />
                Search Agents
              </Button>
              <Button variant="outline" size="sm" className="w-full">
                <Activity className="w-4 h-4 mr-2" />
                Show Performance
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

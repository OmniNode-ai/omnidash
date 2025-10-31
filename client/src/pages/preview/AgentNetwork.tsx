import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MockDataBadge } from "@/components/MockDataBadge";
import { 
  Network, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
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
  Target,
  TrendingUp
} from "lucide-react";

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
  type: "dependency" | "collaboration" | "routing";
}

export default function AgentNetwork() {
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fetch agent registry data
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/agents/agents');
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Fetch routing relationships
  const { data: routingData, isLoading: routingLoading } = useQuery({
    queryKey: ['agent-routing'],
    queryFn: async () => {
      const response = await fetch('/api/agents/routing');
      if (!response.ok) throw new Error('Failed to fetch routing data');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Build network graph from live data
  useEffect(() => {
    if (agentsLoading || routingLoading) {
      setIsLoading(true);
      return;
    }

    // Use live data if available, otherwise fall back to mock
    const agents = agentsData || [];
    const usingMockData = agents.length === 0;

    if (usingMockData) {
      // Mock data fallback
      const mockNodes: AgentNode[] = [
      {
        id: "agent-polymorphic-agent",
        name: "agent-polymorphic-agent",
        title: "Polymorphic Agent (Polly)",
        category: "coordination",
        color: "purple",
        x: 400,
        y: 200,
        size: 80,
        connections: ["agent-api-architect", "agent-debug-intelligence", "agent-frontend-developer", "agent-performance", "agent-testing"],
        performance: { successRate: 88.9, efficiency: 85, totalRuns: 3456 }
      },
      {
        id: "agent-api-architect",
        name: "agent-api-architect",
        title: "API Architect",
        category: "architecture",
        color: "blue",
        x: 200,
        y: 100,
        size: 60,
        connections: ["agent-debug-intelligence", "agent-performance"],
        performance: { successRate: 94.2, efficiency: 92, totalRuns: 1247 }
      },
      {
        id: "agent-debug-intelligence",
        name: "agent-debug-intelligence",
        title: "Debug Intelligence",
        category: "development",
        color: "red",
        x: 200,
        y: 300,
        size: 70,
        connections: ["agent-performance", "agent-testing"],
        performance: { successRate: 91.8, efficiency: 88, totalRuns: 2156 }
      },
      {
        id: "agent-frontend-developer",
        name: "agent-frontend-developer",
        title: "Frontend Developer",
        category: "development",
        color: "cyan",
        x: 600,
        y: 100,
        size: 65,
        connections: ["agent-testing", "agent-performance"],
        performance: { successRate: 96.4, efficiency: 94, totalRuns: 1892 }
      },
      {
        id: "agent-performance",
        name: "agent-performance",
        title: "Performance Specialist",
        category: "quality",
        color: "green",
        x: 400,
        y: 400,
        size: 55,
        connections: ["agent-debug-intelligence", "agent-testing"],
        performance: { successRate: 93.7, efficiency: 91, totalRuns: 1456 }
      },
      {
        id: "agent-testing",
        name: "agent-testing",
        title: "Testing Specialist",
        category: "quality",
        color: "green",
        x: 600,
        y: 300,
        size: 60,
        connections: ["agent-debug-intelligence", "agent-frontend-developer"],
        performance: { successRate: 95.2, efficiency: 89, totalRuns: 2034 }
      }
    ];

    const mockConnections: AgentConnection[] = [
      { from: "agent-polymorphic-agent", to: "agent-api-architect", strength: 0.9, type: "routing" },
      { from: "agent-polymorphic-agent", to: "agent-debug-intelligence", strength: 0.8, type: "routing" },
      { from: "agent-polymorphic-agent", to: "agent-frontend-developer", strength: 0.7, type: "routing" },
      { from: "agent-polymorphic-agent", to: "agent-performance", strength: 0.6, type: "routing" },
      { from: "agent-polymorphic-agent", to: "agent-testing", strength: 0.5, type: "routing" },
      { from: "agent-api-architect", to: "agent-debug-intelligence", strength: 0.8, type: "collaboration" },
      { from: "agent-api-architect", to: "agent-performance", strength: 0.7, type: "collaboration" },
      { from: "agent-debug-intelligence", to: "agent-performance", strength: 0.9, type: "collaboration" },
      { from: "agent-debug-intelligence", to: "agent-testing", strength: 0.8, type: "collaboration" },
      { from: "agent-frontend-developer", to: "agent-testing", strength: 0.9, type: "collaboration" },
      { from: "agent-frontend-developer", to: "agent-performance", strength: 0.6, type: "collaboration" }
    ];

      setNodes(mockNodes);
      setConnections(mockConnections);
      setIsLoading(false);
      return;
    }

    // Transform live agent data to nodes
    const nodes: AgentNode[] = agents.map((agent: any, index: number) => {
      const totalAgents = agents.length;
      const angle = (index / totalAgents) * 2 * Math.PI;
      const radius = 200;
      const centerX = 400;
      const centerY = 300;
      
      return {
        id: agent.id || agent.name,
        name: agent.name || agent.id,
        title: agent.title || agent.name,
        category: agent.category || 'general',
        color: agent.color || 'blue',
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        size: Math.max(40, Math.min(80, (agent.performance?.totalRuns || 0) / 50)),
        connections: [], // Will be populated from routing data
        performance: {
          successRate: (agent.performance?.successRate || 0) * 100,
          efficiency: (agent.performance?.efficiency || 0) * 100,
          totalRuns: agent.performance?.totalRuns || 0,
        },
      };
    });

    // Build connections from routing data
    const connections: AgentConnection[] = [];
    
    // Add routing connections from routing decisions
    if (routingData?.recentDecisions) {
      routingData.recentDecisions.forEach((decision: any) => {
        // Find polymorphic agent (usually the main coordinator)
        const polyAgent = nodes.find(n => n.name.includes('polymorphic') || n.name.includes('polly'));
        const targetAgent = nodes.find(n => n.id === decision.agent || n.name === decision.agent);
        
        if (polyAgent && targetAgent && polyAgent.id !== targetAgent.id) {
          // Check if connection already exists
          const existing = connections.find(
            c => c.from === polyAgent.id && c.to === targetAgent.id
          );
          
          if (!existing) {
            connections.push({
              from: polyAgent.id,
              to: targetAgent.id,
              strength: decision.confidence / 100 || 0.7,
              type: "routing",
            });
          }
        }
      });
    }

    // Add collaboration connections based on similar categories
    nodes.forEach(node => {
      nodes.forEach(otherNode => {
        if (node.id !== otherNode.id && node.category === otherNode.category) {
          const existing = connections.find(
            c => (c.from === node.id && c.to === otherNode.id) || 
                 (c.from === otherNode.id && c.to === node.id)
          );
          
          if (!existing) {
            connections.push({
              from: node.id,
              to: otherNode.id,
              strength: 0.5,
              type: "collaboration",
            });
          }
        }
      });
    });

    // Update node connections list
    nodes.forEach(node => {
      node.connections = connections
        .filter(c => c.from === node.id || c.to === node.id)
        .map(c => c.from === node.id ? c.to : c.from);
    });

    setNodes(nodes);
    setConnections(connections);
    setIsLoading(false);
  }, [agentsData, routingData, agentsLoading, routingLoading]);

  const usingMockData = !agentsData || agentsData.length === 0;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "development": return Code;
      case "architecture": return Layers;
      case "quality": return TestTube;
      case "infrastructure": return Server;
      case "coordination": return Workflow;
      case "documentation": return BookOpen;
      default: return Bot;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "development": return "#3B82F6";
      case "architecture": return "#8B5CF6";
      case "quality": return "#10B981";
      case "infrastructure": return "#F59E0B";
      case "coordination": return "#EC4899";
      case "documentation": return "#6B7280";
      default: return "#6B7280";
    }
  };

  const drawNetwork = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Apply zoom
    ctx.save();
    ctx.scale(zoomLevel / 100, zoomLevel / 100);

    // Draw connections
    connections.forEach(connection => {
      const fromNode = nodes.find(n => n.id === connection.from);
      const toNode = nodes.find(n => n.id === connection.to);
      
      if (!fromNode || !toNode) return;

      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      
      // Set line style based on connection type
      switch (connection.type) {
        case "routing":
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          break;
        case "collaboration":
          ctx.strokeStyle = "#10B981";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          break;
        case "dependency":
          ctx.strokeStyle = "#F59E0B";
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 5]);
          break;
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw nodes
    nodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const color = getCategoryColor(node.category);
      
      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size / 2, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? "#FEF3C7" : color + "20";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#F59E0B" : color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Node label
      ctx.fillStyle = "#1F2937";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(node.title, node.x, node.y + 4);

      // Performance indicator
      const performanceColor = node.performance.efficiency > 90 ? "#10B981" : 
                              node.performance.efficiency > 80 ? "#F59E0B" : "#EF4444";
      ctx.fillStyle = performanceColor;
      ctx.beginPath();
      ctx.arc(node.x + node.size/2 - 8, node.y - node.size/2 + 8, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  };

  useEffect(() => {
    drawNetwork();
  }, [nodes, connections, selectedNode, zoomLevel]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (100 / zoomLevel);
    const y = (event.clientY - rect.top) * (100 / zoomLevel);

    // Find clicked node
    const clickedNode = nodes.find(node => {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      return distance <= node.size / 2;
    });

    setSelectedNode(clickedNode || null);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 25, 50));
  };

  const handleReset = () => {
    setZoomLevel(100);
    setSelectedNode(null);
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
            Visualize agent relationships, routing patterns, and collaboration networks. 
            The graph shows how agents connect: <strong>purple dashed lines</strong> indicate routing decisions 
            (which agent handles which requests), <strong>green lines</strong> show collaboration 
            (agents working together), and <strong>orange dashed lines</strong> show dependencies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMockData && <MockDataBadge />}
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Network Visualization */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Agent Network Graph</CardTitle>
              <CardDescription>
                Interactive visualization of agent relationships and dependencies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-96 border rounded-lg cursor-pointer"
                  onClick={handleCanvasClick}
                />
                
                {/* Legend */}
                <div className="absolute top-4 right-4 bg-muted/90 backdrop-blur-sm rounded-lg p-3 text-sm shadow-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5 bg-purple-500" style={{borderTop: "2px dashed #8B5CF6"}}></div>
                      <span>Routing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5 bg-green-500"></div>
                      <span>Collaboration</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5 bg-orange-500" style={{borderTop: "2px dashed #F59E0B"}}></div>
                      <span>Dependency</span>
                    </div>
                  </div>
                </div>

                {/* Zoom indicator */}
                <div className="absolute bottom-4 left-4 bg-muted/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-medium shadow-lg">
                  Zoom: {zoomLevel}%
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agent Cards (standardized with Agent Management styling) */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
                <CardDescription>Standardized agent cards for clarity and consistency</CardDescription>
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
                          <div className="text-sm font-medium">{n.performance.successRate.toFixed(1)}%</div>
                        </div>
                        <div className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">Efficiency</div>
                          <div className="text-sm font-medium">{n.performance.efficiency.toFixed(1)}%</div>
                        </div>
                        <div className="border rounded p-2">
                          <div className="text-xs text-muted-foreground">Runs</div>
                          <div className="text-sm font-medium">{n.performance.totalRuns.toLocaleString()}</div>
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
                      <span className="font-medium">{selectedNode.performance.successRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Efficiency</span>
                      <span className="font-medium">{selectedNode.performance.efficiency.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Runs</span>
                      <span className="font-medium">{selectedNode.performance.totalRuns.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Connections</div>
                  <div className="space-y-1">
                    {selectedNode.connections.map(connectionId => {
                      const connection = nodes.find(n => n.id === connectionId);
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

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AgentRegistryDetailModal } from "@/components/AgentRegistryDetailModal";
import { 
  Search, 
  Filter, 
  Bot, 
  Zap, 
  Code, 
  Database, 
  Shield, 
  Settings,
  Activity,
  TrendingUp,
  Clock,
  Target,
  Network,
  Users,
  Star,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  Eye,
  BarChart3,
  Layers,
  GitFork,
  Brain,
  Cpu,
  Database as DbIcon,
  Server,
  FileText,
  TestTube,
  Wrench,
  BookOpen,
  Workflow
} from "lucide-react";

interface AgentCapability {
  name: string;
  description: string;
  category: string;
  level: "beginner" | "intermediate" | "expert";
}

interface AgentPerformance {
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
  avgQualityScore: number;
  lastUsed: string;
  popularity: number;
  efficiency: number;
}

interface AgentDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  color: string;
  priority: "low" | "medium" | "high" | "critical";
  capabilities: AgentCapability[];
  activationTriggers: string[];
  domainContext: string;
  specializationLevel: "generalist" | "specialist" | "expert";
  performance: AgentPerformance;
  status: "active" | "inactive" | "deprecated" | "beta";
  lastUpdated: string;
  version: string;
  dependencies: string[];
  tags: string[];
}

interface AgentCategory {
  name: string;
  description: string;
  count: number;
  priority: string;
  icon: React.ComponentType<any>;
  color: string;
}

export default function AgentRegistry() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const categories: AgentCategory[] = [
    {
      name: "development",
      description: "Core development and coding agents",
      count: 14,
      priority: "high",
      icon: Code,
      color: "blue"
    },
    {
      name: "architecture",
      description: "System architecture and design agents",
      count: 8,
      priority: "high",
      icon: Layers,
      color: "purple"
    },
    {
      name: "quality",
      description: "Quality assurance and testing agents",
      count: 8,
      priority: "medium",
      icon: TestTube,
      color: "green"
    },
    {
      name: "infrastructure",
      description: "DevOps and infrastructure agents",
      count: 6,
      priority: "medium",
      icon: Server,
      color: "orange"
    },
    {
      name: "coordination",
      description: "Project and workflow coordination agents",
      count: 7,
      priority: "high",
      icon: Workflow,
      color: "cyan"
    },
    {
      name: "documentation",
      description: "Documentation and knowledge agents",
      count: 5,
      priority: "low",
      icon: BookOpen,
      color: "gray"
    }
  ];

  // API calls
  const { data: agentsData, isLoading: agentsLoading } = useQuery<AgentDefinition[]>({
    queryKey: ['agents', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/agents/agents?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['agent-categories'],
    queryFn: async () => {
      const response = await fetch('/api/agents/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['agent-performance'],
    queryFn: async () => {
      const response = await fetch('/api/agents/performance');
      if (!response.ok) throw new Error('Failed to fetch performance data');
      return response.json();
    },
  });

  const { data: routingData, isLoading: routingLoading } = useQuery({
    queryKey: ['agent-routing'],
    queryFn: async () => {
      const response = await fetch('/api/agents/routing');
      if (!response.ok) throw new Error('Failed to fetch routing data');
      return response.json();
    },
  });

  // Update state when data changes
  useEffect(() => {
    if (agentsData) {
      setAgents(agentsData);
    }
  }, [agentsData]);

  useEffect(() => {
    setIsLoading(agentsLoading || categoriesLoading || performanceLoading || routingLoading);
  }, [agentsLoading, categoriesLoading, performanceLoading, routingLoading]);

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === "all" || agent.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category?.icon || Bot;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-100 text-red-800";
      case "high": return "bg-orange-100 text-orange-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "low": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800";
      case "inactive": return "bg-gray-100 text-gray-800";
      case "deprecated": return "bg-red-100 text-red-800";
      case "beta": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading agent registry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Registry</h1>
          <p className="text-muted-foreground">
            Discover and manage AI agents with their capabilities, performance metrics, and routing intelligence
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Bot className="w-4 h-4 mr-2" />
            Add Agent
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">All Agents</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="routing">Routing Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Search and Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search agents, capabilities, or tags..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory("all")}
                  >
                    All ({agents.length})
                  </Button>
                  {categories.map((category) => (
                    <Button
                      key={category.name}
                      variant={selectedCategory === category.name ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category.name)}
                    >
                      <category.icon className="w-4 h-4 mr-2" />
                      {category.name} ({category.count})
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Card key={category.name} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 text-${category.color}-600`} />
                        <CardTitle className="text-lg capitalize">{category.name}</CardTitle>
                      </div>
                      <Badge variant="secondary">{category.count}</Badge>
                    </div>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Priority</span>
                        <Badge variant="outline" className={getPriorityColor(category.priority)}>
                          {category.priority}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Active Agents</span>
                        <span className="font-medium">
                          {agents.filter(a => a.category === category.name && a.status === "active").length}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Agent Activity</CardTitle>
              <CardDescription>Latest agent executions and performance updates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {agents
                  .sort((a, b) => new Date(b.performance.lastUsed).getTime() - new Date(a.performance.lastUsed).getTime())
                  .slice(0, 5)
                  .map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full bg-${agent.color}-500`}></div>
                        <div>
                          <div className="font-medium">{agent.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {agent.category} • {formatDate(agent.performance.lastUsed)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">{agent.performance.successRate.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Success Rate</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedAgent(agent)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => {
              const Icon = getCategoryIcon(agent.category);
              return (
                <Card key={agent.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 text-${agent.color}-600`} />
                        <div>
                          <CardTitle className="text-lg">{agent.title}</CardTitle>
                          <CardDescription className="text-sm">{agent.name}</CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="outline" className={getPriorityColor(agent.priority)}>
                          {agent.priority}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(agent.status)}>
                          {agent.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{agent.description}</p>
                    
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Capabilities</div>
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities.slice(0, 3).map((capability, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {capability.name}
                          </Badge>
                        ))}
                        {agent.capabilities.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{agent.capabilities.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Success Rate</div>
                        <div className="font-medium">{agent.performance.successRate.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total Runs</div>
                        <div className="font-medium">{agent.performance.totalRuns.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="outline" size="sm" onClick={() => setSelectedAgent(agent)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Play className="w-4 h-4 mr-2" />
                        Execute
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Capabilities Matrix</CardTitle>
              <CardDescription>Comprehensive view of all agent capabilities and their expertise levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {categories.map((category) => {
                  const categoryAgents = agents.filter(agent => agent.category === category.name);
                  const allCapabilities = categoryAgents.flatMap(agent => agent.capabilities);
                  const uniqueCapabilities = Array.from(new Set(allCapabilities.map(cap => cap.name)))
                    .map(name => allCapabilities.find(cap => cap.name === name)!);

                  return (
                    <div key={category.name} className="space-y-4">
                      <div className="flex items-center gap-2">
                        <category.icon className={`w-5 h-5 text-${category.color}-600`} />
                        <h3 className="text-lg font-semibold capitalize">{category.name}</h3>
                        <Badge variant="outline">{categoryAgents.length} agents</Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {uniqueCapabilities.map((capability, index) => {
                          const agentsWithCapability = categoryAgents.filter(agent => 
                            agent.capabilities.some(cap => cap.name === capability.name)
                          );
                          
                          return (
                            <div key={index} className="p-3 border rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium text-sm">{capability.name}</div>
                                <Badge variant="outline" className="text-xs">
                                  {capability.level}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mb-2">
                                {capability.description}
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">Used by: </span>
                                <span className="font-medium">{agentsWithCapability.length} agents</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>Agent performance metrics and rankings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agents
                    .sort((a, b) => b.performance.efficiency - a.performance.efficiency)
                    .slice(0, 10)
                    .map((agent, index) => (
                      <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium">{agent.title}</div>
                            <div className="text-sm text-muted-foreground">{agent.category}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{agent.performance.efficiency}%</div>
                            <div className="text-xs text-muted-foreground">Efficiency</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{agent.performance.successRate.toFixed(1)}%</div>
                            <div className="text-xs text-muted-foreground">Success</div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
                <CardDescription>Agent performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Performance trends chart would go here</p>
                    <p className="text-sm text-muted-foreground">
                      Showing efficiency and success rate trends over time
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Routing Intelligence</CardTitle>
              <CardDescription>Agent routing decisions, confidence scores, and optimization opportunities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">94.2%</div>
                    <div className="text-sm text-muted-foreground">Routing Accuracy</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">45ms</div>
                    <div className="text-sm text-muted-foreground">Avg Routing Time</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">3.2</div>
                    <div className="text-sm text-muted-foreground">Avg Alternatives</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Recent Routing Decisions</h3>
                  <div className="space-y-2">
                    {[
                      { query: "optimize my API performance", agent: "agent-performance", confidence: 92, time: "45ms" },
                      { query: "debug database connection issues", agent: "agent-debug-intelligence", confidence: 89, time: "38ms" },
                      { query: "create a React component", agent: "agent-frontend-developer", confidence: 95, time: "42ms" },
                      { query: "write unit tests", agent: "agent-testing", confidence: 87, time: "51ms" },
                      { query: "design microservices architecture", agent: "agent-api-architect", confidence: 91, time: "39ms" }
                    ].map((decision, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{decision.query}</div>
                          <div className="text-sm text-muted-foreground">
                            Routed to {decision.agent} with {decision.confidence}% confidence
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{decision.confidence}%</div>
                            <div className="text-xs text-muted-foreground">Confidence</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{decision.time}</div>
                            <div className="text-xs text-muted-foreground">Time</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Agent Detail Modal */}
      <AgentRegistryDetailModal
        agent={selectedAgent}
        isOpen={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}

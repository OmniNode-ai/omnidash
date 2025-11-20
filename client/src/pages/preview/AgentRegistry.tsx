import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentRegistrySource } from "@/lib/data-sources";
import { getPollingInterval } from "@/lib/constants/query-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentRegistryDetailModal } from "@/components/AgentRegistryDetailModal";
import { AgentExecutionTraceModal } from "@/components/AgentExecutionTraceModal";
import {
  Search,
  Bot,
  Code,
  ArrowRight,
  Play,
  Eye,
  BarChart3,
  Server,
  TestTube,
  BookOpen,
  Layers,
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
  const [selectedStatus, setSelectedStatus] = useState("all"); // New: filter by status (active/all)
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<{correlationId: string, agentName: string} | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // performance metric mode: 'success' shows success percentage, 'time' shows avg execution time in ms
  const [performanceMetricMode, setPerformanceMetricMode] = useState<'success' | 'time'>('time');
  const [performanceTrendTimeRange, setPerformanceTrendTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

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

  // Use centralized data source
  const { data: registryData, isLoading: agentsLoading, error: registryError } = useQuery({
    queryKey: ['agent-registry', selectedCategory, searchQuery, selectedStatus],
    queryFn: () => agentRegistrySource.fetchAll({
      category: selectedCategory,
      search: searchQuery,
      status: selectedStatus
    }),
    refetchInterval: getPollingInterval(60000),
  });

  const agentsData = registryData?.agents;

  // Fetch recent actions for Recent Activity section
  const { data: recentActionsData } = useQuery({
    queryKey: ['recent-actions'],
    queryFn: () => agentRegistrySource.fetchRecentActivity(20),
    refetchInterval: getPollingInterval(10000), // Refresh every 10 seconds
  });

  const recentActions = recentActionsData?.data || [];

  // Update state when data changes
  useEffect(() => {
    if (agentsData) {
      setAgents(agentsData as any); // Type conversion between imported and local AgentDefinition
    }
  }, [agentsData]);

  useEffect(() => {
    setIsLoading(agentsLoading);
  }, [agentsLoading]);

  const filteredAgents = agents.filter(agent => {
    const name = agent.name?.toLowerCase?.() || "";
    const title = agent.title?.toLowerCase?.() || "";
    const description = agent.description?.toLowerCase?.() || "";
    const tags: string[] = Array.isArray(agent.tags) ? agent.tags : [];

    const q = searchQuery.toLowerCase();
    const matchesSearch = name.includes(q) ||
                         title.includes(q) ||
                         description.includes(q) ||
                         tags.some(tag => (tag || "").toLowerCase().includes(q));
    
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

  const getColorHex = (color: string) => {
    switch (color) {
      case "blue": return "#3B82F6";
      case "purple": return "#8B5CF6";
      case "green": return "#10B981";
      case "orange": return "#F59E0B";
      case "cyan": return "#06B6D4";
      case "gray": return "#6B7280";
      default: return "#6B7280";
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

  if (registryError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">Failed to load agent registry.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

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
    <div className="space-y-6 min-h-screen bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">All Agents</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Search and Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Search & Filters</CardTitle>
              <CardDescription>Find agents by name, capabilities, or tags and filter by category or status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {/* Search and Status Toggle Row */}
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
                  {/* Status Filter Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Show:</span>
                    <Button
                      variant={selectedStatus === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("active")}
                    >
                      Active Only
                    </Button>
                    <Button
                      variant={selectedStatus === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("all")}
                    >
                      All Agents
                    </Button>
                  </div>
                </div>
                {/* Category Filter Row */}
                <div className="flex gap-2 flex-wrap">
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
              const isSelected = selectedCategory === category.name;
              return (
                <Card
                  key={category.name}
                  className={`cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] ${isSelected ? 'ring-2 ring-primary shadow-md' : ''}`}
                  onClick={() => setSelectedCategory(category.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCategory(category.name);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Filter by ${category.name} category`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" style={{ color: getColorHex(category.color) }} />
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

          {/* Filtered Agents Section */}
          {selectedCategory !== "all" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Filtered Agents: {selectedCategory}</CardTitle>
                    <CardDescription>
                      {filteredAgents.length} {filteredAgents.length === 1 ? 'agent' : 'agents'} in this category
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCategory("all")}
                  >
                    Clear Filter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredAgents.map((agent) => {
                    const Icon = getCategoryIcon(agent.category);
                    return (
                      <Card
                        key={agent.id}
                        className="cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
                        onClick={() => setSelectedAgent(agent)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAgent(agent);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View details for ${agent.title}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <Icon className="w-5 h-5" style={{ color: getColorHex(agent.color) }} />
                              <div>
                                <CardTitle className="text-base">{agent.title}</CardTitle>
                                <CardDescription className="text-xs">{agent.name}</CardDescription>
                              </div>
                            </div>
                            <Badge variant="outline" className={getStatusColor(agent.status)}>
                              {agent.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>

                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="text-center p-2 bg-muted rounded">
                              <div className="font-medium text-green-600">
                                {Math.max(0, Math.min(100, agent.performance.successRate)).toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Success</div>
                            </div>
                            <div className="text-center p-2 bg-muted rounded">
                              <div className="font-medium text-blue-600">
                                {agent.performance.efficiency}%
                              </div>
                              <div className="text-xs text-muted-foreground">Efficiency</div>
                            </div>
                            <div className="text-center p-2 bg-muted rounded">
                              <div className="font-medium text-purple-600">
                                {agent.performance.totalRuns.toLocaleString()}
                              </div>
                              <div className="text-xs text-muted-foreground">Runs</div>
                            </div>
                          </div>

                          {agent.tags && agent.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {agent.tags.slice(0, 3).map((tag, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {agent.tags.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{agent.tags.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Agent Activity</CardTitle>
              <CardDescription>Latest agent executions and performance updates (click to view execution trace)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActions && recentActions.length > 0 ? (
                  recentActions.slice(0, 5).map((action: any) => {
                    const agentTitle = action.agentName?.replace('agent-', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown Agent';
                    return (
                      <div
                        key={action.id}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
                        onClick={() => {
                          setSelectedExecution({
                            correlationId: action.correlationId,
                            agentName: action.agentName || 'Unknown Agent'
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedExecution({
                              correlationId: action.correlationId,
                              agentName: action.agentName || 'Unknown Agent'
                            });
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`View execution trace for ${action.agentName || 'Unknown Agent'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <div>
                            <div className="font-medium">{agentTitle}</div>
                            <div className="text-sm text-muted-foreground">
                              {action.actionType} • {action.actionName} • {new Date(action.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{action.durationMs ? `${action.durationMs}ms` : 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">Duration</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          {/* Filters for All Agents Tab */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search agents..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                {/* Status Filter Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Show:</span>
                  <Button
                    variant={selectedStatus === "active" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedStatus("active")}
                  >
                    Active Only
                  </Button>
                  <Button
                    variant={selectedStatus === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedStatus("all")}
                  >
                    All Agents
                  </Button>
                </div>
                {/* Category Quick Filter */}
                <div className="flex gap-2">
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory("all")}
                  >
                    All
                  </Button>
                  {categories.slice(0, 3).map((category) => (
                    <Button
                      key={category.name}
                      variant={selectedCategory === category.name ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category.name)}
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => {
              const Icon = getCategoryIcon(agent.category);
              return (
                <Card key={agent.id} className="cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]" tabIndex={0} role="button" aria-label={`View details for ${agent.title}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" style={{ color: getColorHex(agent.color) }} />
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
                    
                    {agent.capabilities && agent.capabilities.length > 0 && (
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
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Success Rate</div>
                        <div className="font-medium">{Math.max(0, Math.min(100, agent.performance.successRate)).toFixed(1)}%</div>
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

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Performance Overview</CardTitle>
                  <CardDescription>Agent performance metrics and rankings</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={performanceMetricMode === 'time' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPerformanceMetricMode('time')}
                  >
                    Completion Time (ms)
                  </Button>
                  <Button
                    variant={performanceMetricMode === 'success' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPerformanceMetricMode('success')}
                  >
                    Success %
                  </Button>
                </div>
              </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {agents
                    .sort((a, b) => {
                      if (performanceMetricMode === 'time') {
                        return (a.performance.avgExecutionTime || 0) - (b.performance.avgExecutionTime || 0); // ascending time better
                      }
                      const sa = Math.max(0, Math.min(100, a.performance.successRate || 0));
                      const sb = Math.max(0, Math.min(100, b.performance.successRate || 0));
                      return sb - sa; // descending success%
                    })
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
                          {performanceMetricMode === 'time' ? (
                            <>
                              <div className="text-right">
                                <div className="text-sm font-medium">{Math.max(0, agent.performance.avgExecutionTime || 0)}ms</div>
                                <div className="text-xs text-muted-foreground">Avg Time</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">{Math.max(0, Math.min(100, agent.performance.successRate || 0)).toFixed(1)}%</div>
                                <div className="text-xs text-muted-foreground">Success</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-right">
                                <div className="text-sm font-medium">{Math.max(0, Math.min(100, agent.performance.successRate || 0)).toFixed(1)}%</div>
                                <div className="text-xs text-muted-foreground">Success</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">{Math.max(0, agent.performance.avgExecutionTime || 0)}ms</div>
                                <div className="text-xs text-muted-foreground">Avg Time</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Performance Trends</CardTitle>
                    <CardDescription>Agent performance over time</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={performanceTrendTimeRange === '7d' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPerformanceTrendTimeRange('7d')}
                    >
                      7D
                    </Button>
                    <Button
                      variant={performanceTrendTimeRange === '30d' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPerformanceTrendTimeRange('30d')}
                    >
                      30D
                    </Button>
                    <Button
                      variant={performanceTrendTimeRange === '90d' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPerformanceTrendTimeRange('90d')}
                    >
                      90D
                    </Button>
                    <Button
                      variant={performanceTrendTimeRange === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPerformanceTrendTimeRange('all')}
                    >
                      All Time
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={performanceMetricMode === 'time' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPerformanceMetricMode('time')}
                  >
                    Completion Time (ms)
                  </Button>
                  <Button
                    variant={performanceMetricMode === 'success' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPerformanceMetricMode('success')}
                  >
                    Success %
                  </Button>
                </div>
              </div>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-muted/20 rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground font-medium mb-1">
                      Performance trends visualization
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tracking {performanceMetricMode === 'time' ? 'completion time (ms)' : 'success rate (%)'} over {performanceTrendTimeRange === 'all' ? 'all time' : `last ${performanceTrendTimeRange.toUpperCase()}`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* Agent Detail Modal */}
      <AgentRegistryDetailModal
        agent={selectedAgent}
        isOpen={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />

      <AgentExecutionTraceModal
        isOpen={!!selectedExecution}
        onClose={() => setSelectedExecution(null)}
        correlationId={selectedExecution?.correlationId || ''}
        agentName={selectedExecution?.agentName || ''}
      />
    </div>
  );
}

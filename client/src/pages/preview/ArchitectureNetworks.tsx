import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { architectureNetworksSource } from "@/lib/data-sources";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DashboardSection } from "@/components/DashboardSection";
import { MockDataBadge } from "@/components/MockDataBadge";
import {
  Network,
  Database,
  Activity,
  Layers,
  Eye,
  Settings,
  Search,
  Filter,
  Workflow,
  GitBranch,
  Server,
  Zap,
  Cpu,
  HardDrive,
  Wifi,
  Users,
  BookOpen,
  Code,
  Target,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  CalendarIcon,
  RefreshCw
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Import existing components
import NodeNetworkComposer from "./NodeNetworkComposer";
import KnowledgeGraph from "../KnowledgeGraph";
import EventFlow from "../EventFlow";

// Mock data interfaces
interface ArchitectureSummary {
  totalNodes: number;
  activeNodes: number;
  totalConnections: number;
  networkHealth: number;
  avgLatency: number;
  dataFlow: number;
  knowledgeEntities: number;
  eventThroughput: number;
}

interface NodeGroup {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "degraded" | "critical" | "maintenance";
  nodes: number;
  connections: number;
  latency: number;
  throughput: number;
  parent?: string;
  children: string[];
}

interface KnowledgeEntity {
  id: string;
  name: string;
  type: string;
  connections: number;
  lastUpdated: string;
  confidence: number;
  usage: number;
}

interface EventFlowData {
  totalEvents: number;
  eventsPerSecond: number;
  avgProcessingTime: number;
  errorRate: number;
  topEventTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
}

export default function ArchitectureNetworks() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use centralized data source
  const { data: architectureData, isLoading, error, refetch } = useQuery({
    queryKey: ['architecture-networks', timeRange],
    queryFn: () => architectureNetworksSource.fetchAll(timeRange),
    refetchInterval: 60000,
  });

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Transform to expected formats
  const architectureSummary: ArchitectureSummary = architectureData?.summary ? {
    totalNodes: architectureData.summary.totalNodes || 0,
    activeNodes: (architectureData.summary as any).activeNodes ?? (architectureData.summary.totalNodes || 0),
    totalConnections: architectureData.summary.totalEdges || 0,
    networkHealth: (architectureData.summary as any).networkHealth ?? 95,
    avgLatency: (architectureData.summary as any).avgLatency ?? 45,
    dataFlow: (architectureData.summary as any).dataFlow ?? 1200,
    knowledgeEntities: (architectureData.knowledgeEntities || []).length,
    eventThroughput: (architectureData.summary as any).eventThroughput ?? 250,
  } : {
    totalNodes: 0,
    activeNodes: 0,
    totalConnections: 0,
    networkHealth: 0,
    avgLatency: 0,
    dataFlow: 0,
    knowledgeEntities: 0,
    eventThroughput: 0,
  };

  const nodeGroups: NodeGroup[] = (architectureData?.nodes || []).map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
    status: (n as any).status ?? 'healthy',
    nodes: (n as any).nodes ?? 1,
    connections: (n as any).connections ?? 0,
    latency: (n as any).latency ?? 0,
    throughput: (n as any).throughput ?? 0,
    children: (n as any).children ?? [],
  }));

  const knowledgeEntities: KnowledgeEntity[] = (architectureData?.knowledgeEntities || []).map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    connections: (e as any).connections ?? 0,
    lastUpdated: (e as any).lastUpdated ?? new Date().toISOString(),
    confidence: (e as any).confidence ?? 0.9,
    usage: (e as any).usage ?? 0,
  }));

  const eventFlowData: EventFlowData = architectureData?.eventFlow ? {
    totalEvents: (architectureData.eventFlow.events || []).length,
    eventsPerSecond: (architectureData.eventFlow as any).eventsPerSecond ?? 10,
    avgProcessingTime: (architectureData.eventFlow as any).avgProcessingTime ?? 50,
    errorRate: (architectureData.eventFlow as any).errorRate ?? 0.5,
    topEventTypes: (architectureData.eventFlow as any).topEventTypes ?? [],
  } : {
    totalEvents: 0,
    eventsPerSecond: 0,
    avgProcessingTime: 0,
    errorRate: 0,
    topEventTypes: [],
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "text-green-600 bg-green-100";
      case "degraded": return "text-yellow-600 bg-yellow-100";
      case "critical": return "text-red-600 bg-red-100";
      case "maintenance": return "text-blue-600 bg-blue-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading architecture & networks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-red-600 mb-2">Error loading data</p>
          <p className="text-sm text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Architecture & Networks</h1>
          <p className="ty-subtitle">
            System architecture, node networks, knowledge graph, and event flow management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MockDataBadge />
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Search className="w-4 h-4 mr-2" />
            Explore
          </Button>

          {/* TIME RANGE CONTROLS */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={timeRange === "1h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("1h")}
            >
              1H
            </Button>
            <Button
              variant={timeRange === "24h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("24h")}
            >
              24H
            </Button>
            <Button
              variant={timeRange === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("7d")}
            >
              7D
            </Button>
            <Button
              variant={timeRange === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("30d")}
            >
              30D
            </Button>

            {/* Custom date range picker */}
            <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === "custom" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={(range) => {
                    setCustomRange(range);
                    if (range?.from && range?.to) {
                      setTimeRange("custom");
                      setShowCustomPicker(false);
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Show selected custom range */}
            {timeRange === "custom" && customRange?.from && customRange?.to && (
              <span className="text-sm text-muted-foreground">
                {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d, yyyy")}
              </span>
            )}

            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="networks">Node Networks</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Graph</TabsTrigger>
          <TabsTrigger value="events">Event Flow</TabsTrigger>
          <TabsTrigger value="composer">Network Composer</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Architecture Summary Metrics */}
          <DashboardSection
            title="Architecture Summary"
            description="Overall system architecture metrics and health status"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
                  <Network className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {architectureSummary?.totalNodes || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {architectureSummary?.activeNodes || 0} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Connections</CardTitle>
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {architectureSummary?.totalConnections?.toLocaleString() || "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Network density: {((architectureSummary?.totalConnections || 0) / (architectureSummary?.totalNodes || 1)).toFixed(1)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Network Health</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {architectureSummary?.networkHealth?.toFixed(1) || "0"}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Avg latency: {architectureSummary?.avgLatency || 0}ms
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Knowledge Entities</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {architectureSummary?.knowledgeEntities?.toLocaleString() || "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {eventFlowData?.eventsPerSecond || 0} events/sec
                  </p>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>

          {/* Node Groups and Knowledge Entities */}
          <DashboardSection
            title="Architecture Components"
            description="Node groups and knowledge entities across the system"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Node Groups</CardTitle>
                  <CardDescription>System architecture components and their status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {nodeGroups?.slice(0, 5).map((group) => (
                      <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            group.status === 'healthy' ? 'bg-green-500' :
                            group.status === 'degraded' ? 'bg-yellow-500' :
                            group.status === 'critical' ? 'bg-red-500' : 'bg-blue-500'
                          }`}></div>
                          <div>
                            <div className="font-medium text-sm">{group.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {group.nodes} nodes • {group.connections} connections
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-medium">{group.latency}ms</div>
                            <div className="text-xs text-muted-foreground">Latency</div>
                          </div>
                          <Badge variant="outline" className={getStatusColor(group.status)}>
                            {group.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Knowledge Entities</CardTitle>
                  <CardDescription>Most connected and frequently used entities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {knowledgeEntities?.slice(0, 5).map((entity) => (
                      <div key={entity.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Database className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium text-sm">{entity.name}</div>
                            <div className="text-xs text-muted-foreground">{entity.type}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{entity.connections}</div>
                          <div className="text-xs text-muted-foreground">Connections</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>

          {/* Event Flow and Performance Metrics */}
          <DashboardSection
            title="Event Flow & Performance"
            description="Real-time event processing metrics and top event types"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Event Flow Performance</CardTitle>
                  <CardDescription>Real-time event processing metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {eventFlowData?.eventsPerSecond || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Events/sec</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {eventFlowData?.avgProcessingTime || 0}ms
                        </div>
                        <div className="text-xs text-muted-foreground">Avg Processing</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Error Rate</span>
                        <span>{(eventFlowData?.errorRate * 100)?.toFixed(2) || "0"}%</span>
                      </div>
                      <Progress value={eventFlowData?.errorRate * 100 || 0} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Event Types</CardTitle>
                  <CardDescription>Most frequent event types in the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {eventFlowData?.topEventTypes?.slice(0, 5).map((eventType, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Activity className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium text-sm">{eventType.type}</div>
                            <div className="text-xs text-muted-foreground">{eventType.count} events</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{Math.max(0, Math.min(100, eventType.percentage)).toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">of total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>
        </TabsContent>

        <TabsContent value="networks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Node Network Visualization</CardTitle>
              <CardDescription>Interactive network graph showing system architecture and dependencies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96 border rounded-lg flex items-center justify-center bg-muted/50">
                <div className="text-center">
                  <Network className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Network visualization would be rendered here</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Interactive graph showing {architectureSummary?.totalNodes || 0} nodes and {architectureSummary?.totalConnections || 0} connections
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <KnowledgeGraph />
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <EventFlow />
        </TabsContent>

        <TabsContent value="composer" className="space-y-4">
          <NodeNetworkComposer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

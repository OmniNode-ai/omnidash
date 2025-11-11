import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { developerToolsSource } from "@/lib/data-sources";
import type { DeveloperActivity, ToolUsage, QueryHistory } from "@/lib/data-sources/developer-tools-source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Settings,
  MessageSquare,
  Search,
  Eye,
  Play,
  Pause,
  RotateCcw,
  Filter,
  Target,
  TrendingUp,
  Clock,
  Users,
  Zap,
  Code,
  TestTube,
  Server,
  BookOpen,
  Layers,
  Workflow,
  Brain,
  Cpu,
  Database,
  FileText,
  GitBranch,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Activity,
  CalendarIcon,
  RefreshCw
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Import existing components
import { ChatInterface } from "../../components/ChatInterface";
import CorrelationTrace from "../CorrelationTrace";
import AdvancedSettings from "./AdvancedSettings";
import { DashboardSection } from "@/components/DashboardSection";
import { MockDataBadge } from "@/components/MockDataBadge";

// Types imported from data source

export default function DeveloperTools() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use centralized data source
  const { data: toolsData, isLoading, error } = useQuery({
    queryKey: ['developer-tools', timeRange],
    queryFn: () => developerToolsSource.fetchAll(timeRange),
    refetchInterval: 60000,
  });

  const developerActivity = toolsData?.activity;
  const toolUsage = toolsData?.toolUsage;
  const queryHistory = toolsData?.queryHistory;
  const usingMockData = true; // Developer tools currently uses mock data

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Trigger refetch logic here if needed
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading developer tools...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-destructive">
        <strong>Error loading data:</strong> {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Developer Tools</h1>
          <p className="ty-subtitle">
            Integrated development tools, query assistant, event tracing, and utilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMockData && <MockDataBadge />}
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4 mr-2" />
            Export Report
          </Button>

          {/* TIME RANGE SELECTOR */}
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
          </div>

          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assistant">Query Assistant</TabsTrigger>
          <TabsTrigger value="tracing">Event Tracing</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Developer Activity Metrics */}
          <DashboardSection
            title="Developer Activity"
            description="Real-time metrics for developer tool usage and satisfaction"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {developerActivity?.totalQueries?.toLocaleString() || "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {developerActivity?.activeSessions || 0} active sessions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {developerActivity?.avgResponseTime || 0}ms
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">-15ms</span> from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Satisfaction Score</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {developerActivity?.satisfactionScore?.toFixed(1) || "0"}/10
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">+0.3</span> from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Tools</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {toolUsage?.length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Available tools
                  </p>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>

          {/* Top Tools and Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Most Used Tools</CardTitle>
                <CardDescription>Developer tools ranked by usage and satisfaction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {toolUsage?.slice(0, 5).map((tool, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{tool.toolName}</div>
                          <div className="text-xs text-muted-foreground">{tool.category}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{tool.avgRating.toFixed(1)}/5</div>
                        <div className="text-xs text-muted-foreground">{tool.usageCount} uses</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Queries</CardTitle>
                <CardDescription>Latest developer queries and responses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {queryHistory?.slice(0, 5).map((query) => (
                    <div key={query.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{query.query}</div>
                          <div className="text-xs text-muted-foreground">
                            {query.tool} • {new Date(query.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {query.rating && (
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <div
                                key={i}
                                className={`w-3 h-3 ${
                                  i < query.rating! ? 'text-yellow-400' : 'text-gray-300'
                                }`}
                              >
                                ★
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tool Categories and Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Tool Categories</CardTitle>
                <CardDescription>Available tools organized by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { name: "Query Assistant", icon: MessageSquare, count: 1, color: "bg-blue-100 text-blue-600" },
                    { name: "Event Tracing", icon: Search, count: 1, color: "bg-green-100 text-green-600" },
                    { name: "Code Analysis", icon: Code, count: 3, color: "bg-purple-100 text-purple-600" },
                    { name: "System Monitoring", icon: Server, count: 2, color: "bg-orange-100 text-orange-600" },
                    { name: "Data Visualization", icon: BarChart3, count: 4, color: "bg-pink-100 text-pink-600" },
                    { name: "Configuration", icon: Settings, count: 1, color: "bg-gray-100 text-gray-600" }
                  ].map((category, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className={`p-2 rounded-lg ${category.color}`}>
                        <category.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{category.name}</div>
                        <div className="text-xs text-muted-foreground">{category.count} tools</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common developer tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { action: "Ask AI Assistant", description: "Get help with coding questions", icon: MessageSquare },
                    { action: "Trace Event Flow", description: "Debug event processing issues", icon: Search },
                    { action: "Analyze Code Quality", description: "Run code quality analysis", icon: Code },
                    { action: "View System Health", description: "Check platform status", icon: Server },
                    { action: "Configure Settings", description: "Update tool preferences", icon: Settings }
                  ].map((action, index) => (
                    <Button key={index} variant="outline" className="w-full justify-start h-auto p-3">
                      <action.icon className="w-4 h-4 mr-3" />
                      <div className="text-left">
                        <div className="font-medium text-sm">{action.action}</div>
                        <div className="text-xs text-muted-foreground">{action.description}</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assistant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Query Assistant</CardTitle>
              <CardDescription>Intelligent assistant for development questions and code help</CardDescription>
            </CardHeader>
            <CardContent>
              <ChatInterface />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracing" className="space-y-4">
          <CorrelationTrace />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <AdvancedSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

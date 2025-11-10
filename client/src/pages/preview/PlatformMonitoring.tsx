import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformMonitoringSource } from "@/lib/data-sources";
import type { SystemStatus, DeveloperMetrics, Incident } from "@/lib/data-sources/platform-monitoring-source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Shield,
  Server,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Database,
  Network,
  Cpu,
  HardDrive,
  Wifi,
  Zap,
  TrendingUp,
  TrendingDown,
  Eye,
  Settings,
  RefreshCw,
  Bell,
  BarChart3,
  Target,
  Code,
  GitBranch,
  MessageSquare,
  CalendarIcon
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Import existing components
import SystemHealth from "./SystemHealth";
import PlatformHealth from "../PlatformHealth";
import DeveloperExperience from "../DeveloperExperience";

// Types imported from data source
import type { ServiceStatus } from "@/lib/data-sources/platform-monitoring-source";

export default function PlatformMonitoring() {
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use centralized data source
  const { data: monitoringData, isLoading } = useQuery({
    queryKey: ['platform-monitoring', timeRange],
    queryFn: () => platformMonitoringSource.fetchAll(timeRange),
    refetchInterval: 30000,
  });

  const systemStatus = monitoringData?.systemStatus;
  const developerMetrics = monitoringData?.developerMetrics;
  const incidents = monitoringData?.incidents;

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate refresh
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "text-green-400 bg-green-900/30 border border-green-700/40";
      case "degraded": return "text-yellow-400 bg-yellow-900/30 border border-yellow-700/40";
      case "critical": return "text-red-400 bg-red-900/30 border border-red-700/40";
      case "maintenance": return "text-blue-400 bg-blue-900/30 border border-blue-700/40";
      default: return "text-gray-400 bg-gray-900/30 border border-gray-700/40";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low": return "text-blue-400 bg-blue-900/30 border border-blue-700/40";
      case "medium": return "text-yellow-400 bg-yellow-900/30 border border-yellow-700/40";
      case "high": return "text-orange-400 bg-orange-900/30 border border-orange-700/40";
      case "critical": return "text-red-400 bg-red-900/30 border border-red-700/40";
      default: return "text-gray-400 bg-gray-900/30 border border-gray-700/40";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading platform monitoring...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PAGE HEADER - Outside Card */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Monitoring</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive monitoring of system health, service status, and developer productivity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Bell className="w-4 h-4 mr-2" />
            Alerts
          </Button>

          {/* TIME RANGE CONTROLS - Button Group Pattern */}
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

      {/* TABS AND CONTENT - Inside Card */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="system">System Health</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="developers">Developer Metrics</TabsTrigger>
              <TabsTrigger value="incidents">Incidents</TabsTrigger>
            </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* System Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">System Status</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    systemStatus?.overall === 'healthy' ? 'bg-green-500' :
                    systemStatus?.overall === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                  <span className="text-2xl font-bold capitalize">
                    {systemStatus?.overall || "Unknown"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Uptime: {systemStatus?.uptime?.toFixed(2) || "0"}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Services</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {systemStatus?.services?.filter(s => s.status === 'healthy').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {systemStatus?.services?.length || 0} total services
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Developers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {developerMetrics?.activeDevelopers || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {developerMetrics?.totalDevelopers || 0} total developers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {incidents?.filter(i => i.status !== 'resolved' && i.status !== 'closed').length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {incidents?.filter(i => i.severity === 'critical').length || 0} critical
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Status Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Service Status</CardTitle>
                <CardDescription>Real-time status of all platform services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {systemStatus?.services?.slice(0, 5).map((service, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          service.status === 'healthy' ? 'bg-green-500' :
                          service.status === 'degraded' ? 'bg-yellow-500' :
                          service.status === 'critical' ? 'bg-red-500' : 'bg-blue-500'
                        }`}></div>
                        <div>
                          <div className="font-medium text-sm">{service.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {service.responseTime}ms • {service.uptime.toFixed(1)}% uptime
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className={getStatusColor(service.status)}>
                        {service.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Incidents</CardTitle>
                <CardDescription>Latest incidents and their status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {incidents?.slice(0, 5).map((incident) => (
                    <div key={incident.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-4 h-4 ${
                          incident.severity === 'critical' ? 'text-red-500' :
                          incident.severity === 'high' ? 'text-orange-500' :
                          incident.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                        }`} />
                        <div>
                          <div className="font-medium text-sm">{incident.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {incident.affectedServices.join(", ")} • {incident.startTime}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getSeverityColor(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant="outline">
                          {incident.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Developer Productivity Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Developer Productivity</CardTitle>
              <CardDescription>Key metrics for development team performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{developerMetrics?.avgCommitsPerDay || 0}</div>
                  <div className="text-xs text-muted-foreground">Commits/Day</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{developerMetrics?.avgPullRequestsPerDay || 0}</div>
                  <div className="text-xs text-muted-foreground">PRs/Day</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{developerMetrics?.avgCodeReviewTime || 0}h</div>
                  <div className="text-xs text-muted-foreground">Avg Review Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{developerMetrics?.codeQualityScore || 0}/10</div>
                  <div className="text-xs text-muted-foreground">Quality Score</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <PlatformHealth />
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Monitoring</CardTitle>
              <CardDescription>Detailed status and performance of all platform services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {systemStatus?.services?.map((service, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Server className="w-5 h-5 text-primary" />
                        <div>
                          <div className="font-medium">{service.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Last check: {service.lastCheck}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">{service.responseTime}ms</div>
                          <div className="text-xs text-muted-foreground">Response Time</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{service.uptime.toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Uptime</div>
                        </div>
                        <Badge variant="outline" className={getStatusColor(service.status)}>
                          {service.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Uptime</div>
                        <Progress value={service.uptime} className="h-2" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Dependencies</div>
                        <div className="text-sm">
                          {service.dependencies.length > 0 
                            ? service.dependencies.join(", ")
                            : "None"
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="developers" className="space-y-4">
          <DeveloperExperience />
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Incident Management</CardTitle>
              <CardDescription>Track and manage platform incidents and outages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {incidents?.map((incident) => (
                  <div key={incident.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className={`w-5 h-5 ${
                          incident.severity === 'critical' ? 'text-red-500' :
                          incident.severity === 'high' ? 'text-orange-500' :
                          incident.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                        }`} />
                        <div>
                          <div className="font-medium">{incident.title}</div>
                          <div className="text-sm text-muted-foreground">
                            Started: {incident.startTime}
                            {incident.endTime && ` • Ended: ${incident.endTime}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getSeverityColor(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant="outline">
                          {incident.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        <strong>Description:</strong> {incident.description}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <strong>Affected Services:</strong> {incident.affectedServices.join(", ")}
                      </div>
                      {incident.assignee && (
                        <div className="text-sm text-muted-foreground">
                          <strong>Assignee:</strong> {incident.assignee}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

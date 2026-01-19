import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformMonitoringSource } from '@/lib/data-sources';
import { POLLING_INTERVAL_MEDIUM, getPollingInterval } from '@/lib/constants/query-config';
import type { SystemStatus as _SystemStatus, Incident as _Incident } from '@/lib/data-sources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Server, Users, AlertTriangle, Settings, RefreshCw, Bell } from 'lucide-react';

// Import existing components
import PlatformHealth from '../PlatformHealth';
import DeveloperExperience from '../DeveloperExperience';

// Types imported from data source
import type { ServiceStatus as _ServiceStatus } from '@/lib/data-sources';

export default function PlatformMonitoring() {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, _setTimeRange] = useState('24h');

  // Use centralized data source
  const { data: monitoringData, isLoading } = useQuery({
    queryKey: ['platform-monitoring', timeRange],
    queryFn: () => platformMonitoringSource.fetchAll(timeRange),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
  });

  const systemStatus = monitoringData?.systemStatus;
  const developerMetrics = monitoringData?.developerMetrics;
  const incidents = monitoringData?.incidents;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-100';
      case 'degraded':
        return 'text-yellow-600 bg-yellow-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'maintenance':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'text-blue-600 bg-blue-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Platform Monitoring</h1>
          <p className="ty-subtitle">
            Comprehensive monitoring of system health, service status, and developer productivity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Bell className="w-4 h-4 mr-2" />
            Alerts
          </Button>
        </div>
      </div>

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
                  <div
                    className={`w-3 h-3 rounded-full ${
                      systemStatus?.overall === 'healthy'
                        ? 'bg-green-500'
                        : systemStatus?.overall === 'degraded'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                  ></div>
                  <span className="text-2xl font-bold capitalize">
                    {systemStatus?.overall || 'Unknown'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Uptime: {systemStatus?.uptime?.toFixed(2) || '0'}%
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
                  {systemStatus?.services?.filter((s) => s.status === 'healthy').length || 0}
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
                <div className="text-2xl font-bold">{developerMetrics?.activeDevelopers || 0}</div>
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
                  {incidents?.filter((i) => i.status !== 'resolved' && i.status !== 'closed')
                    .length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {incidents?.filter((i) => i.severity === 'critical').length || 0} critical
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
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            service.status === 'healthy'
                              ? 'bg-green-500'
                              : service.status === 'degraded'
                                ? 'bg-yellow-500'
                                : service.status === 'critical'
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                          }`}
                        ></div>
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
                    <div
                      key={incident.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle
                          className={`w-4 h-4 ${
                            incident.severity === 'critical'
                              ? 'text-red-500'
                              : incident.severity === 'high'
                                ? 'text-orange-500'
                                : incident.severity === 'medium'
                                  ? 'text-yellow-500'
                                  : 'text-blue-500'
                          }`}
                        />
                        <div>
                          <div className="font-medium text-sm">{incident.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {incident.affectedServices.join(', ')} • {incident.startTime}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getSeverityColor(incident.severity)}>
                          {incident.severity}
                        </Badge>
                        <Badge variant="outline">{incident.status}</Badge>
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
                  <div className="text-2xl font-bold">
                    {developerMetrics?.avgCommitsPerDay || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Commits/Day</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {developerMetrics?.avgPullRequestsPerDay || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">PRs/Day</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {developerMetrics?.avgCodeReviewTime || 0}h
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Review Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {developerMetrics?.codeQualityScore || 0}/10
                  </div>
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
              <CardDescription>
                Detailed status and performance of all platform services
              </CardDescription>
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
                            ? service.dependencies.join(', ')
                            : 'None'}
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
                        <AlertTriangle
                          className={`w-5 h-5 ${
                            incident.severity === 'critical'
                              ? 'text-red-500'
                              : incident.severity === 'high'
                                ? 'text-orange-500'
                                : incident.severity === 'medium'
                                  ? 'text-yellow-500'
                                  : 'text-blue-500'
                          }`}
                        />
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
                        <Badge variant="outline">{incident.status}</Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        <strong>Description:</strong> {incident.description}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <strong>Affected Services:</strong> {incident.affectedServices.join(', ')}
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
    </div>
  );
}

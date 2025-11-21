import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { developerToolsSource } from '@/lib/data-sources';
import { getPollingInterval } from '@/lib/constants/query-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  MessageSquare,
  Search,
  Play,
  Target,
  Clock,
  Code,
  Server,
  BarChart3,
} from 'lucide-react';

// Import existing components
import { ChatInterface } from '../../components/ChatInterface';
import CorrelationTrace from '../CorrelationTrace';
import AdvancedSettings from './AdvancedSettings';

// Types imported from data source

export default function DeveloperTools() {
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, _setTimeRange] = useState('24h');

  // Use centralized data source
  const { data: toolsData, isLoading } = useQuery({
    queryKey: ['developer-tools', timeRange],
    queryFn: () => developerToolsSource.fetchAll(timeRange),
    refetchInterval: getPollingInterval(60000),
  });

  const developerActivity = toolsData?.activity;
  const toolUsage = toolsData?.toolUsage;
  const queryHistory = toolsData?.queryHistory;

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
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button size="sm">
            <Play className="w-4 h-4 mr-2" />
            Quick Start
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Queries</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {developerActivity?.totalQueries?.toLocaleString() || '0'}
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
                  {developerActivity?.satisfactionScore?.toFixed(1) || '0'}/10
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
                <div className="text-2xl font-bold">{toolUsage?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Available tools</p>
              </CardContent>
            </Card>
          </div>

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
                    <div
                      key={query.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
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
                    {
                      name: 'Query Assistant',
                      icon: MessageSquare,
                      count: 1,
                      color: 'bg-blue-100 text-blue-600',
                    },
                    {
                      name: 'Event Tracing',
                      icon: Search,
                      count: 1,
                      color: 'bg-green-100 text-green-600',
                    },
                    {
                      name: 'Code Analysis',
                      icon: Code,
                      count: 3,
                      color: 'bg-purple-100 text-purple-600',
                    },
                    {
                      name: 'System Monitoring',
                      icon: Server,
                      count: 2,
                      color: 'bg-orange-100 text-orange-600',
                    },
                    {
                      name: 'Data Visualization',
                      icon: BarChart3,
                      count: 4,
                      color: 'bg-pink-100 text-pink-600',
                    },
                    {
                      name: 'Configuration',
                      icon: Settings,
                      count: 1,
                      color: 'bg-gray-100 text-gray-600',
                    },
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
                    {
                      action: 'Ask AI Assistant',
                      description: 'Get help with coding questions',
                      icon: MessageSquare,
                    },
                    {
                      action: 'Trace Event Flow',
                      description: 'Debug event processing issues',
                      icon: Search,
                    },
                    {
                      action: 'Analyze Code Quality',
                      description: 'Run code quality analysis',
                      icon: Code,
                    },
                    {
                      action: 'View System Health',
                      description: 'Check platform status',
                      icon: Server,
                    },
                    {
                      action: 'Configure Settings',
                      description: 'Update tool preferences',
                      icon: Settings,
                    },
                  ].map((action, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="w-full justify-start h-auto p-3"
                    >
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
              <CardDescription>
                Intelligent assistant for development questions and code help
              </CardDescription>
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

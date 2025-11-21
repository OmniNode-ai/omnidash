import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Settings,
  Download,
  Bell,
  TrendingUp,
  TrendingDown,
  Eye,
  AlertCircle,
  BarChart3,
  Lock,
  Activity,
  Lightbulb,
} from 'lucide-react';

export default function SystemHealth() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeSection, setActiveSection] = useState('overview');

  // Mock real-time data
  const [systemStatus, _setSystemStatus] = useState({
    overall: 'healthy',
    uptime: '99.9%',
    lastIncident: '2025-10-15T14:30:00Z',
    activeAlerts: 2,
    totalChecks: 47,
    passedChecks: 45,
  });

  const services = [
    {
      name: 'PostgreSQL Database',
      status: 'healthy',
      uptime: '99.98%',
      responseTime: '12ms',
      lastCheck: '2s ago',
      details: {
        connections: { current: 45, max: 100 },
        queries: { perSecond: 156, avgTime: '8ms' },
        storage: { used: '2.3GB', total: '10GB' },
      },
    },
    {
      name: 'Kafka Event Bus',
      status: 'healthy',
      uptime: '99.95%',
      responseTime: '8ms',
      lastCheck: '1s ago',
      details: {
        topics: { active: 4, total: 4 },
        consumers: { active: 12, lag: 0 },
        throughput: { messagesPerSecond: 1247 },
      },
    },
    {
      name: 'Qdrant Vector DB',
      status: 'degraded',
      uptime: '98.2%',
      responseTime: '156ms',
      lastCheck: '5s ago',
      details: {
        collections: { active: 3, total: 3 },
        vectors: { total: 125000, indexed: 124500 },
        memory: { used: '1.2GB', total: '2GB' },
      },
    },
    {
      name: 'Omniarchon Service',
      status: 'healthy',
      uptime: '99.8%',
      responseTime: '45ms',
      lastCheck: '3s ago',
      details: {
        endpoints: { active: 8, total: 8 },
        requests: { perMinute: 89, avgTime: '42ms' },
        cache: { hitRate: '87%' },
      },
    },
    {
      name: 'WebSocket Server',
      status: 'healthy',
      uptime: '99.9%',
      responseTime: '3ms',
      lastCheck: '1s ago',
      details: {
        connections: { active: 23, max: 1000 },
        messages: { perSecond: 156, queued: 0 },
        latency: { avg: '3ms', p95: '8ms' },
      },
    },
  ];

  const alerts = [
    {
      id: 1,
      severity: 'warning',
      title: 'High Memory Usage',
      description: 'Qdrant service is using 85% of allocated memory',
      timestamp: '2025-10-28T19:15:00Z',
      acknowledged: false,
    },
    {
      id: 2,
      severity: 'info',
      title: 'Scheduled Maintenance',
      description: 'Database maintenance scheduled for 2025-10-29T02:00:00Z',
      timestamp: '2025-10-28T18:00:00Z',
      acknowledged: true,
    },
  ];

  const metrics = [
    { name: 'CPU Usage', value: 65, status: 'warning', trend: '+5%' },
    { name: 'Memory Usage', value: 78, status: 'warning', trend: '+12%' },
    { name: 'Disk Usage', value: 45, status: 'healthy', trend: '+2%' },
    { name: 'Network I/O', value: 32, status: 'healthy', trend: '-8%' },
    { name: 'Database Connections', value: 45, status: 'healthy', trend: '+3%' },
    { name: 'Cache Hit Rate', value: 87, status: 'healthy', trend: '+1%' },
  ];

  // Security & Compliance Data
  const securityMetrics = [
    { name: 'Security Score', value: 95, status: 'excellent', trend: '+2%' },
    { name: 'Vulnerabilities', value: 2, status: 'good', trend: '-1' },
    { name: 'Failed Logins', value: 3, status: 'good', trend: '-2' },
    { name: 'SSL Certificates', value: 100, status: 'excellent', trend: '0%' },
    { name: 'Firewall Rules', value: 24, status: 'good', trend: '+1' },
    { name: 'Access Attempts', value: 156, status: 'normal', trend: '+12%' },
  ];

  // Predictive Analytics Data
  const predictions = [
    { metric: 'CPU Usage', current: 65, predicted: 78, confidence: 0.85, timeframe: '1 hour' },
    { metric: 'Memory Usage', current: 78, predicted: 82, confidence: 0.92, timeframe: '2 hours' },
    { metric: 'Disk Usage', current: 45, predicted: 48, confidence: 0.78, timeframe: '6 hours' },
    { metric: 'Network Load', current: 32, predicted: 45, confidence: 0.88, timeframe: '3 hours' },
  ];

  // Resource Optimization Data
  const optimizationSuggestions = [
    {
      type: 'performance',
      title: 'Enable Connection Pooling',
      impact: 'Reduce DB latency by 30%',
      priority: 'high',
    },
    {
      type: 'cost',
      title: 'Right-size Qdrant Instance',
      impact: 'Save $200/month',
      priority: 'medium',
    },
    {
      type: 'efficiency',
      title: 'Implement Caching Layer',
      impact: 'Reduce API calls by 40%',
      priority: 'high',
    },
    {
      type: 'scaling',
      title: 'Add Load Balancer',
      impact: 'Handle 50% more traffic',
      priority: 'low',
    },
  ];

  // Incident History
  const incidentHistory = [
    {
      id: 1,
      severity: 'critical',
      title: 'Database Connection Pool Exhausted',
      duration: '15m',
      resolved: true,
      timestamp: '2025-10-28T14:30:00Z',
    },
    {
      id: 2,
      severity: 'warning',
      title: 'High Memory Usage on Qdrant',
      duration: '2h',
      resolved: true,
      timestamp: '2025-10-27T09:15:00Z',
    },
    {
      id: 3,
      severity: 'info',
      title: 'Scheduled Maintenance Window',
      duration: '1h',
      resolved: true,
      timestamp: '2025-10-26T02:00:00Z',
    },
    {
      id: 4,
      severity: 'critical',
      title: 'Kafka Consumer Lag',
      duration: '45m',
      resolved: true,
      timestamp: '2025-10-25T16:20:00Z',
    },
  ];

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setLastUpdated(new Date());
    }, 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'unhealthy':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'info':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of system components and infrastructure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div
                className={`h-3 w-3 rounded-full ${
                  systemStatus.overall === 'healthy'
                    ? 'bg-green-500'
                    : systemStatus.overall === 'degraded'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
              />
              <span className="text-2xl font-bold capitalize">{systemStatus.overall}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {systemStatus.passedChecks}/{systemStatus.totalChecks} checks passed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.uptime}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last incident: {new Date(systemStatus.lastIncident).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.activeAlerts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {alerts.filter((a) => !a.acknowledged).length} unacknowledged
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lastUpdated.toLocaleTimeString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Auto-refresh every 30s</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={activeSection === 'overview' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('overview')}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Overview
        </Button>
        <Button
          variant={activeSection === 'security' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('security')}
        >
          <Shield className="w-4 h-4 mr-2" />
          Security
        </Button>
        <Button
          variant={activeSection === 'predictions' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('predictions')}
        >
          <Eye className="w-4 h-4 mr-2" />
          Predictions
        </Button>
        <Button
          variant={activeSection === 'optimization' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('optimization')}
        >
          <Lightbulb className="w-4 h-4 mr-2" />
          Optimization
        </Button>
        <Button
          variant={activeSection === 'incidents' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveSection('incidents')}
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          Incidents
        </Button>
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Service Status */}
          <Card>
            <CardHeader>
              <CardTitle>Service Status</CardTitle>
              <CardDescription>Real-time status of all system components</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {services.map((service, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`${getStatusColor(service.status)}`}>
                        {getStatusIcon(service.status)}
                      </div>
                      <div>
                        <div className="font-medium">{service.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {service.uptime} uptime • {service.responseTime} response time
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={
                          service.status === 'healthy'
                            ? 'default'
                            : service.status === 'degraded'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {service.status}
                      </Badge>
                      <div className="text-sm text-muted-foreground">{service.lastCheck}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* System Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map((metric, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{metric.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">{metric.value}%</span>
                      <div className="flex items-center gap-1">
                        {metric.trend.startsWith('+') ? (
                          <TrendingUp className="h-4 w-4 text-red-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm text-muted-foreground">{metric.trend}</span>
                      </div>
                    </div>
                    <Progress
                      value={metric.value}
                      className="w-full"
                      // @ts-ignore
                      data-status={metric.status}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Active Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>Current system alerts and notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <Alert key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                    <div className={`h-2 w-2 rounded-full ${getSeverityColor(alert.severity)}`} />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{alert.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {alert.description}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-xs">
                              Acknowledged
                            </Badge>
                          )}
                          <Button variant="outline" size="sm">
                            {alert.acknowledged ? 'Unacknowledge' : 'Acknowledge'}
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security Section */}
      {activeSection === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {securityMetrics.map((metric, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{metric.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">
                        {metric.value}
                        {metric.name.includes('Score') || metric.name.includes('Certificates')
                          ? '%'
                          : ''}
                      </span>
                      <div className="flex items-center gap-1">
                        {metric.trend.startsWith('+') ? (
                          <TrendingUp className="h-4 w-4 text-red-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm text-muted-foreground">{metric.trend}</span>
                      </div>
                    </div>
                    <Progress
                      value={metric.value}
                      className="w-full"
                      // @ts-ignore
                      data-status={metric.status}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        0
                        {metric.name.includes('Score') || metric.name.includes('Certificates')
                          ? '%'
                          : ''}
                      </span>
                      <span>
                        100
                        {metric.name.includes('Score') || metric.name.includes('Certificates')
                          ? '%'
                          : ''}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Security Compliance
              </CardTitle>
              <CardDescription>Security compliance status and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Compliance Status</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">GDPR Compliance</span>
                        <Badge variant="default">Compliant</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">SOC 2 Type II</span>
                        <Badge variant="default">Compliant</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">ISO 27001</span>
                        <Badge variant="secondary">In Progress</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Security Recommendations</h4>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        • Enable 2FA for all admin accounts
                      </div>
                      <div className="text-sm text-muted-foreground">
                        • Update SSL certificates (expires in 30 days)
                      </div>
                      <div className="text-sm text-muted-foreground">
                        • Review firewall rules quarterly
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Predictions Section */}
      {activeSection === 'predictions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {predictions.map((prediction, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    {prediction.metric} Prediction
                  </CardTitle>
                  <CardDescription>
                    ML-powered prediction for {prediction.timeframe}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Current Value</span>
                      <span className="text-2xl font-bold">{prediction.current}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Predicted Value</span>
                      <span className="text-2xl font-bold text-blue-600">
                        {prediction.predicted}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Confidence</span>
                      <div className="flex items-center gap-2">
                        <Progress value={prediction.confidence * 100} className="w-20" />
                        <span className="text-sm font-medium">
                          {(prediction.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Timeframe</span>
                      <Badge variant="outline">{prediction.timeframe}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Optimization Section */}
      {activeSection === 'optimization' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Optimization Recommendations
              </CardTitle>
              <CardDescription>
                AI-powered suggestions for improving system performance and efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {optimizationSuggestions.map((suggestion, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{suggestion.title}</h4>
                      <Badge
                        variant={
                          suggestion.priority === 'high'
                            ? 'destructive'
                            : suggestion.priority === 'medium'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {suggestion.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{suggestion.impact}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        Apply
                      </Button>
                      <Button size="sm" variant="ghost">
                        Learn More
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Incidents Section */}
      {activeSection === 'incidents' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Incident History
              </CardTitle>
              <CardDescription>Historical incidents and their resolution status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {incidentHistory.map((incident) => (
                  <div key={incident.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{incident.title}</h4>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            incident.severity === 'critical'
                              ? 'destructive'
                              : incident.severity === 'warning'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {incident.severity}
                        </Badge>
                        {incident.resolved && <Badge variant="default">Resolved</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="ml-2 font-medium">{incident.duration}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Timestamp:</span>
                        <span className="ml-2 font-medium">
                          {new Date(incident.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

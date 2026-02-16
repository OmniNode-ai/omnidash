import { useState } from 'react';
import { MockDataBadge } from '@/components/MockDataBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  Clock,
  Zap,
  Target,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Shield,
  Layers,
  Database,
  AlertCircle,
  Lightbulb,
  BarChart,
  Info,
  Copy,
  Code,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface EnhancedAnalyticsProps {
  timeRange?: string;
}

export function EnhancedAnalytics({ timeRange = '24h' }: EnhancedAnalyticsProps) {
  const [activeSection, setActiveSection] = useState('performance');
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  // Mock data for demonstration
  const systemMetrics = {
    totalRequests: 1247,
    avgResponseTime: 45,
    successRate: 98.5,
    activeUsers: 23,
    errorRate: 1.5,
    throughput: 52.3,
    aiModelCosts: 234.5,
    codeQualityScore: 87,
    securityScore: 95,
    testCoverage: 92,
  };

  // AI Model Performance Data
  const _aiModelPerformance = [
    {
      model: 'Claude-3.5-Sonnet',
      requests: 456,
      avgResponseTime: 1.2,
      cost: 89.5,
      successRate: 98.8,
      tokens: 125000,
    },
    {
      model: 'Mixtral-8x7B',
      requests: 234,
      avgResponseTime: 2.1,
      cost: 45.2,
      successRate: 96.5,
      tokens: 89000,
    },
    {
      model: 'DeepSeek-Coder',
      requests: 189,
      avgResponseTime: 0.8,
      cost: 32.1,
      successRate: 99.2,
      tokens: 67000,
    },
    {
      model: 'GPT-4',
      requests: 156,
      avgResponseTime: 1.5,
      cost: 67.7,
      successRate: 97.8,
      tokens: 98000,
    },
  ];

  // Predictive Analytics Data
  const _predictions = [
    { metric: 'CPU Usage', current: 65, predicted: 78, confidence: 0.85, trend: 'increasing' },
    { metric: 'Memory Usage', current: 78, predicted: 82, confidence: 0.92, trend: 'increasing' },
    { metric: 'Response Time', current: 45, predicted: 52, confidence: 0.78, trend: 'increasing' },
    { metric: 'Error Rate', current: 1.5, predicted: 2.1, confidence: 0.88, trend: 'increasing' },
  ];

  // Forecast data for trend graphs
  const cpuForecastData = [
    { date: '11/1', actual: 58, predicted: null },
    { date: '11/2', actual: 62, predicted: null },
    { date: '11/3', actual: 60, predicted: null },
    { date: '11/4', actual: 63, predicted: null },
    { date: '11/5', actual: 65, predicted: null },
    { date: '11/6', actual: 67, predicted: null },
    { date: '11/7', actual: 68, predicted: 68 },
    { date: '11/8', actual: null, predicted: 70 },
    { date: '11/9', actual: null, predicted: 72 },
    { date: '11/10', actual: null, predicted: 71 },
  ];

  const memoryForecastData = [
    { date: '11/1', actual: 70, predicted: null },
    { date: '11/2', actual: 72, predicted: null },
    { date: '11/3', actual: 74, predicted: null },
    { date: '11/4', actual: 75, predicted: null },
    { date: '11/5', actual: 76, predicted: null },
    { date: '11/6', actual: 77, predicted: null },
    { date: '11/7', actual: 78, predicted: 78 },
    { date: '11/8', actual: null, predicted: 80 },
    { date: '11/9', actual: null, predicted: 82 },
    { date: '11/10', actual: null, predicted: 83 },
  ];

  const errorRateForecastData = [
    { date: '11/1', actual: 1.2, predicted: null },
    { date: '11/2', actual: 1.3, predicted: null },
    { date: '11/3', actual: 1.1, predicted: null },
    { date: '11/4', actual: 1.4, predicted: null },
    { date: '11/5', actual: 1.5, predicted: null },
    { date: '11/6', actual: 1.6, predicted: null },
    { date: '11/7', actual: 1.5, predicted: 1.5 },
    { date: '11/8', actual: null, predicted: 1.8 },
    { date: '11/9', actual: null, predicted: 2.1 },
    { date: '11/10', actual: null, predicted: 2.0 },
  ];

  const responseTimeForecastData = [
    { date: '11/1', actual: 38, predicted: null },
    { date: '11/2', actual: 40, predicted: null },
    { date: '11/3', actual: 42, predicted: null },
    { date: '11/4', actual: 43, predicted: null },
    { date: '11/5', actual: 44, predicted: null },
    { date: '11/6', actual: 45, predicted: null },
    { date: '11/7', actual: 45, predicted: 45 },
    { date: '11/8', actual: null, predicted: 48 },
    { date: '11/9', actual: null, predicted: 52 },
    { date: '11/10', actual: null, predicted: 50 },
  ];

  // Anomaly Detection Data (filtered to show only problems)
  type AnomalyStatus = 'normal' | 'warning' | 'critical' | 'error';

  interface Anomaly {
    id: string;
    metric: string;
    status: AnomalyStatus;
    currentValue: number | string;
    expectedValue: number | string;
    deviation: number;
    detectedAt: Date;
    severity: 'low' | 'medium' | 'high';
    machine: string;
  }

  const allAnomalies: Anomaly[] = [
    {
      id: '1',
      metric: 'CPU Spike Detected',
      status: 'critical',
      currentValue: '95%',
      expectedValue: '65%',
      deviation: 46,
      detectedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      severity: 'high',
      machine: 'prod-server-03',
    },
    {
      id: '2',
      metric: 'Memory Usage Elevated',
      status: 'warning',
      currentValue: '82%',
      expectedValue: '70%',
      deviation: 17,
      detectedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      severity: 'medium',
      machine: 'prod-server-01',
    },
    {
      id: '3',
      metric: 'Response Time Anomaly',
      status: 'critical',
      currentValue: '850ms',
      expectedValue: '120ms',
      deviation: 608,
      detectedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      severity: 'high',
      machine: 'api-gateway-02',
    },
    {
      id: '4',
      metric: 'Disk I/O Threshold Exceeded',
      status: 'warning',
      currentValue: '92%',
      expectedValue: '75%',
      deviation: 23,
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      severity: 'medium',
      machine: 'db-server-01',
    },
  ];

  // Filter out 'normal' status items - only show problems
  const anomalies = allAnomalies
    .filter((a) => a.status !== 'normal')
    .sort((a, b) => {
      // Sort by severity: high > medium > low
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

  // Code Quality Metrics (removed Security Vulnerabilities - it's in the Security & Coverage section)
  const codeQualityDetails = [
    {
      metric: 'Cyclomatic Complexity',
      value: 12,
      threshold: 15,
      status: 'good',
      ranges: [
        { label: 'Excellent', range: '< 5', description: 'Simple, easy to maintain' },
        { label: 'Good', range: '5-10', description: 'Acceptable complexity' },
        { label: 'Fair', range: '10-15', description: 'Consider refactoring' },
        { label: 'Poor', range: '> 15', description: 'High risk, needs refactoring' },
      ],
    },
    {
      metric: 'Code Duplication',
      value: 8,
      threshold: 10,
      status: 'good',
      ranges: [
        { label: 'Excellent', range: '< 3%', description: 'Minimal duplication' },
        { label: 'Good', range: '3-5%', description: 'Acceptable duplication' },
        { label: 'Fair', range: '5-10%', description: 'Moderate duplication' },
        { label: 'Poor', range: '> 10%', description: 'High duplication, extract shared code' },
      ],
    },
    {
      metric: 'Technical Debt',
      value: 23,
      threshold: 30,
      status: 'warning',
      ranges: [
        { label: 'Excellent', range: '< 10 days', description: 'Low technical debt' },
        { label: 'Good', range: '10-20 days', description: 'Manageable debt' },
        { label: 'Fair', range: '20-30 days', description: 'Moderate debt, plan refactoring' },
        { label: 'Poor', range: '> 30 days', description: 'High debt, urgent refactoring needed' },
      ],
    },
    {
      metric: 'Test Coverage',
      value: 92,
      threshold: 80,
      status: 'excellent',
      ranges: [
        { label: 'Excellent', range: '> 90%', description: 'Outstanding coverage' },
        { label: 'Good', range: '80-90%', description: 'Good coverage' },
        { label: 'Fair', range: '70-80%', description: 'Adequate coverage' },
        { label: 'Poor', range: '< 70%', description: 'Insufficient coverage' },
      ],
    },
    {
      metric: 'Performance Issues',
      value: 5,
      threshold: 10,
      status: 'good',
      ranges: [
        { label: 'Excellent', range: '0-2', description: 'No significant issues' },
        { label: 'Good', range: '3-5', description: 'Minor issues' },
        { label: 'Fair', range: '6-10', description: 'Some optimization needed' },
        { label: 'Poor', range: '> 10', description: 'Significant performance problems' },
      ],
    },
  ];

  // Top Improvement Opportunities
  const improvementOpportunities = [
    {
      icon: Target,
      iconColor: 'text-orange-500',
      title: 'Reduce Cyclomatic Complexity',
      impact: 'High Impact',
      impactVariant: 'destructive' as const,
      description:
        '12 functions exceed complexity threshold. Refactoring these would improve maintainability by 23%.',
      current: '12.3',
      target: '8.5',
    },
    {
      icon: Copy,
      iconColor: 'text-blue-500',
      title: 'Eliminate Code Duplication',
      impact: 'Medium Impact',
      impactVariant: 'default' as const,
      description:
        '5 duplicate code blocks found. Extracting to shared utilities would reduce codebase by 8%.',
      current: '8.2%',
      target: '3.0%',
    },
    {
      icon: Code,
      iconColor: 'text-purple-500',
      title: 'Address Technical Debt',
      impact: 'Medium Impact',
      impactVariant: 'default' as const,
      description:
        '23 days of technical debt accumulated. Focus on refactoring legacy authentication module.',
      current: '23 days',
      target: '15 days',
    },
    {
      icon: Zap,
      iconColor: 'text-yellow-500',
      title: 'Optimize Performance Bottlenecks',
      impact: 'Low Impact',
      impactVariant: 'secondary' as const,
      description:
        '5 performance issues identified. Optimizing database queries could improve response time by 15%.',
      current: '5 issues',
      target: '2 issues',
    },
  ];

  // Resource Optimization Recommendations
  const optimizationRecommendations = [
    {
      type: 'cost',
      title: 'Switch to Mixtral for Code Generation',
      impact: 'Save $45/month',
      priority: 'high',
    },
    {
      type: 'performance',
      title: 'Enable Response Caching',
      impact: 'Reduce latency by 30%',
      priority: 'medium',
    },
    {
      type: 'scaling',
      title: 'Add 2 more instances',
      impact: 'Handle 40% more load',
      priority: 'low',
    },
    {
      type: 'efficiency',
      title: 'Optimize Database Queries',
      impact: 'Reduce CPU usage by 15%',
      priority: 'medium',
    },
  ];

  const performanceTrends = [
    { time: '00:00', requests: 45, responseTime: 42, errors: 1 },
    { time: '04:00', requests: 32, responseTime: 38, errors: 0 },
    { time: '08:00', requests: 89, responseTime: 45, errors: 2 },
    { time: '12:00', requests: 156, responseTime: 48, errors: 3 },
    { time: '16:00', requests: 203, responseTime: 52, errors: 1 },
    { time: '20:00', requests: 178, responseTime: 46, errors: 2 },
  ];

  // Routing metrics
  const routingMetrics = {
    accuracy: 94.5,
    fallbackRate: 5.5,
    cacheHitRate: 85.2,
    avgRoutingTime: 12,
    patternInjectionUplift: 35,
  };

  // Pattern uplift data
  const patternUplift = {
    avgResponseTimeImprovement: 28,
    avgSuccessRateIncrease: 12,
    totalPatternsInjected: 3456,
    topImpactedAgents: [
      { agent: 'API Architect', uplift: 42 },
      { agent: 'Frontend Dev', uplift: 38 },
      { agent: 'Database Expert', uplift: 35 },
    ],
  };

  // Pattern Impact Analysis data
  const patternImpactData = [
    {
      id: '1',
      name: 'API Error Handling Pattern',
      tokenReduction: 420,
      tokenReductionPercent: 12,
      responseTime: 35,
      responseTimePercent: 15,
      successRateIncrease: 8.2,
      usageCount: 1245,
      impactScore: 92,
    },
    {
      id: '2',
      name: 'Database Connection Pool',
      tokenReduction: 380,
      tokenReductionPercent: 11,
      responseTime: 28,
      responseTimePercent: 12,
      successRateIncrease: 6.5,
      usageCount: 1089,
      impactScore: 88,
    },
    {
      id: '3',
      name: 'Caching Strategy Pattern',
      tokenReduction: 310,
      tokenReductionPercent: 9,
      responseTime: 42,
      responseTimePercent: 18,
      successRateIncrease: 4.3,
      usageCount: 876,
      impactScore: 85,
    },
    {
      id: '4',
      name: 'Async Task Processing',
      tokenReduction: 265,
      tokenReductionPercent: 8,
      responseTime: 55,
      responseTimePercent: 23,
      successRateIncrease: 5.1,
      usageCount: 654,
      impactScore: 81,
    },
    {
      id: '5',
      name: 'Request Validation',
      tokenReduction: 195,
      tokenReductionPercent: 6,
      responseTime: 18,
      responseTimePercent: 8,
      successRateIncrease: 3.8,
      usageCount: 432,
      impactScore: 74,
    },
  ];

  // Distributed System Health data
  const distributedSystemHealth = [
    {
      machine: 'prod-api-01',
      cpuPercent: 65,
      memoryUsed: 12.5,
      memoryTotal: 16,
      storageUsed: 450,
      storageTotal: 1000,
      networkIO: 2.3,
      status: 'healthy' as const,
    },
    {
      machine: 'prod-api-02',
      cpuPercent: 72,
      memoryUsed: 14.2,
      memoryTotal: 16,
      storageUsed: 520,
      storageTotal: 1000,
      networkIO: 1.8,
      status: 'healthy' as const,
    },
    {
      machine: 'prod-worker-01',
      cpuPercent: 88,
      memoryUsed: 28.1,
      memoryTotal: 32,
      storageUsed: 780,
      storageTotal: 1000,
      networkIO: 4.2,
      status: 'warning' as const,
    },
    {
      machine: 'prod-db-01',
      cpuPercent: 45,
      memoryUsed: 58.5,
      memoryTotal: 64,
      storageUsed: 1800,
      storageTotal: 2000,
      networkIO: 5.1,
      status: 'healthy' as const,
    },
    {
      machine: 'prod-cache-01',
      cpuPercent: 38,
      memoryUsed: 6.8,
      memoryTotal: 8,
      storageUsed: 150,
      storageTotal: 500,
      networkIO: 3.5,
      status: 'healthy' as const,
    },
  ];

  const _topAgents = [
    { name: 'agent-performance', requests: 234, successRate: 99.2, avgTime: 38 },
    { name: 'agent-database', requests: 189, successRate: 97.8, avgTime: 52 },
    { name: 'agent-debug', requests: 156, successRate: 96.5, avgTime: 67 },
    { name: 'agent-api', requests: 134, successRate: 98.9, avgTime: 41 },
    { name: 'agent-security', requests: 98, successRate: 99.5, avgTime: 29 },
  ];

  // Repository metrics with quick win opportunities
  const repositories = [
    {
      id: 'omnidash',
      name: 'omnidash',
      securityScore: 95,
      coverage: 92,
      qualityScore: 87,
      securityGrade: 'A',
      quickWins: [
        {
          action: 'Add 8 more tests',
          impact: 'Increase coverage from 92% to 95%',
          effort: 'low',
          estimatedTime: '2 hours',
        },
        {
          action: 'Fix ESLint warnings',
          impact: 'Improve quality score to 90',
          effort: 'low',
          estimatedTime: '1 hour',
        },
        {
          action: 'Update dependencies',
          impact: 'Security score to 98%',
          effort: 'medium',
          estimatedTime: '3 hours',
        },
      ],
    },
    {
      id: 'omniintelligence',
      name: 'omniintelligence',
      securityScore: 88,
      coverage: 78,
      qualityScore: 82,
      securityGrade: 'B+',
      quickWins: [
        {
          action: 'Add 15 integration tests',
          impact: 'Coverage from 78% to 85%',
          effort: 'medium',
          estimatedTime: '4 hours',
        },
        {
          action: 'Fix 3 high-severity vulnerabilities',
          impact: 'Security grade to A-',
          effort: 'high',
          estimatedTime: '6 hours',
        },
        {
          action: 'Refactor duplicate code',
          impact: 'Quality score to 85',
          effort: 'medium',
          estimatedTime: '3 hours',
        },
      ],
    },
    {
      id: 'omnibase_core',
      name: 'omnibase_core',
      securityScore: 92,
      coverage: 85,
      qualityScore: 90,
      securityGrade: 'A-',
      quickWins: [
        {
          action: 'Add 10 edge case tests',
          impact: 'Coverage from 85% to 90%',
          effort: 'medium',
          estimatedTime: '3 hours',
        },
        {
          action: 'Document public APIs',
          impact: 'Quality score to 93',
          effort: 'low',
          estimatedTime: '2 hours',
        },
        {
          action: 'Enable strict TypeScript',
          impact: 'Quality score to 94',
          effort: 'medium',
          estimatedTime: '4 hours',
        },
      ],
    },
    {
      id: 'omniclaude',
      name: 'omniclaude',
      securityScore: 90,
      coverage: 82,
      qualityScore: 85,
      securityGrade: 'A-',
      quickWins: [
        {
          action: 'Add 12 unit tests',
          impact: 'Coverage from 82% to 88%',
          effort: 'low',
          estimatedTime: '3 hours',
        },
        {
          action: 'Remove deprecated APIs',
          impact: 'Quality score to 88',
          effort: 'medium',
          estimatedTime: '5 hours',
        },
        {
          action: 'Add input validation',
          impact: 'Security score to 93%',
          effort: 'low',
          estimatedTime: '2 hours',
        },
      ],
    },
    {
      id: 'omnibase_infra',
      name: 'omnibase_infra',
      securityScore: 93,
      coverage: 88,
      qualityScore: 89,
      securityGrade: 'A',
      quickWins: [
        {
          action: 'Add 7 error handling tests',
          impact: 'Coverage from 88% to 92%',
          effort: 'low',
          estimatedTime: '2 hours',
        },
        {
          action: 'Optimize database queries',
          impact: 'Quality score to 92',
          effort: 'medium',
          estimatedTime: '4 hours',
        },
        {
          action: 'Add request rate limiting',
          impact: 'Security score to 96%',
          effort: 'low',
          estimatedTime: '2 hours',
        },
      ],
    },
  ];

  const _qualityMetrics = [
    { metric: 'Code Quality', value: 87, trend: '+5%', status: 'improving' },
    { metric: 'Test Coverage', value: 92, trend: '+2%', status: 'excellent' },
    { metric: 'Performance', value: 78, trend: '-1%', status: 'needs_attention' },
    { metric: 'Security', value: 95, trend: '+3%', status: 'excellent' },
    { metric: 'Maintainability', value: 83, trend: '+4%', status: 'good' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <MockDataBadge />
      </div>

      {/* Key Metrics Cards */}
      <Card>
        <CardHeader>
          <CardTitle>System Metrics Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {systemMetrics.totalRequests.toLocaleString()}
                </div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  +12.5% from last {timeRange}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.avgResponseTime}ms</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingDown className="h-3 w-3 mr-1 text-green-500" />
                  -8ms from last {timeRange}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.successRate}%</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  +2.1% from last {timeRange}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.activeUsers}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  +3 from last {timeRange}
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Main Analytics Sections */}
      <div className="space-y-4">
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeSection === 'performance' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection('performance')}
          >
            <BarChart className="w-4 h-4 mr-2" />
            Performance
          </Button>
          <Button
            variant={activeSection === 'quality' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection('quality')}
          >
            <Shield className="w-4 h-4 mr-2" />
            Quality
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
            variant={activeSection === 'routing' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection('routing')}
          >
            <Zap className="w-4 h-4 mr-2" />
            Routing & Patterns
          </Button>
        </div>

        {/* Performance Section */}
        {activeSection === 'performance' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance Trends Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Trends</CardTitle>
                  <CardDescription>Request volume and response times over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Requests</TableHead>
                        <TableHead>Response Time (ms)</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performanceTrends.map((data, index) => (
                        <TableRow key={index} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{data.time}</TableCell>

                          {/* Requests column */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-muted rounded-full h-2">
                                <div
                                  className="bg-blue-500 h-2 rounded-full"
                                  style={{ width: `${(data.requests / 250) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm">{data.requests}</span>
                            </div>
                          </TableCell>

                          {/* Response Time column */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-muted rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{ width: `${(data.responseTime / 60) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm">{data.responseTime}ms</span>
                            </div>
                          </TableCell>

                          {/* Errors column */}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {data.errors > 0 ? (
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                              ) : (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              )}
                              <span className="text-sm">{data.errors}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Distributed System Health */}
              <Card>
                <CardHeader>
                  <CardTitle>Distributed System Health</CardTitle>
                  <CardDescription>
                    Real-time resource utilization across infrastructure
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>Memory (RAM)</TableHead>
                        <TableHead>Storage (Disk)</TableHead>
                        <TableHead>Network I/O</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {distributedSystemHealth.map((machine) => (
                        <TableRow
                          key={machine.machine}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            // TODO: Add machine drill-down
                            console.warn('Show machine details:', machine.machine);
                          }}
                        >
                          <TableCell className="font-mono text-sm font-medium">
                            {machine.machine}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={machine.cpuPercent} className="w-20" />
                              <span className="text-sm">{machine.cpuPercent}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={(machine.memoryUsed / machine.memoryTotal) * 100}
                                className="w-20"
                              />
                              <span className="text-sm whitespace-nowrap">
                                {machine.memoryUsed}GB / {machine.memoryTotal}GB
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={(machine.storageUsed / machine.storageTotal) * 100}
                                className="w-20"
                              />
                              <span className="text-sm whitespace-nowrap">
                                {machine.storageUsed}GB / {machine.storageTotal}GB
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{machine.networkIO} GB/s</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                machine.status === 'healthy'
                                  ? 'default'
                                  : machine.status === 'warning'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {machine.status.charAt(0).toUpperCase() + machine.status.slice(1)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Quality Section */}
        {activeSection === 'quality' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Code Quality Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Code Quality Metrics
                  </CardTitle>
                  <CardDescription>Detailed code quality analysis and thresholds</CardDescription>
                </CardHeader>
                <CardContent>
                  <TooltipProvider>
                    <div className="space-y-4">
                      {codeQualityDetails.map((metric, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{metric.metric}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <div className="space-y-1 text-xs">
                                    {metric.ranges.map((range, idx) => (
                                      <p key={idx}>
                                        <strong>{range.label}:</strong> {range.range} (
                                        {range.description})
                                      </p>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">{metric.value}</span>
                              <Badge
                                variant={
                                  metric.status === 'excellent'
                                    ? 'default'
                                    : metric.status === 'good'
                                      ? 'secondary'
                                      : 'destructive'
                                }
                              >
                                {metric.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={(metric.value / metric.threshold) * 100}
                              className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground">
                              /{metric.threshold}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>

              {/* Security & Test Coverage by Repository */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Security & Coverage by Repository
                  </CardTitle>
                  <CardDescription>
                    Click on a repository to see improvement opportunities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Repository</TableHead>
                        <TableHead>Security</TableHead>
                        <TableHead>Coverage</TableHead>
                        <TableHead>Quality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repositories.map((repo) => (
                        <>
                          <TableRow
                            key={repo.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() =>
                              setExpandedRepo(expandedRepo === repo.id ? null : repo.id)
                            }
                          >
                            <TableCell className="font-mono text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {expandedRepo === repo.id ? (
                                  <AlertTriangle className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                {repo.name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={repo.securityScore} className="w-20" />
                                <span className="text-sm font-bold">{repo.securityScore}%</span>
                                <Badge
                                  variant={
                                    repo.securityGrade.startsWith('A')
                                      ? 'default'
                                      : repo.securityGrade.startsWith('B')
                                        ? 'secondary'
                                        : 'destructive'
                                  }
                                >
                                  {repo.securityGrade}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={repo.coverage} className="w-20" />
                                <span className="text-sm font-bold">{repo.coverage}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={repo.qualityScore} className="w-20" />
                                <span className="text-sm font-bold">{repo.qualityScore}%</span>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Quick Wins */}
                          {expandedRepo === repo.id && (
                            <TableRow key={`${repo.id}-expanded`}>
                              <TableCell colSpan={4}>
                                <div className="py-4 px-6 bg-muted/30 rounded-lg space-y-3">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                                    <h4 className="font-semibold">Quick Wins for {repo.name}</h4>
                                  </div>
                                  <div className="space-y-2">
                                    {repo.quickWins.map((win, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-start gap-3 p-3 border rounded-lg bg-background"
                                      >
                                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                                        <div className="flex-1">
                                          <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium">{win.action}</span>
                                            <Badge
                                              variant={
                                                win.effort === 'low'
                                                  ? 'default'
                                                  : win.effort === 'medium'
                                                    ? 'secondary'
                                                    : 'destructive'
                                              }
                                            >
                                              {win.effort} effort
                                            </Badge>
                                          </div>
                                          <p className="text-sm text-muted-foreground mb-2">
                                            {win.impact}
                                          </p>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            <span>Est. time: {win.estimatedTime}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Top Improvement Opportunities */}
            <Card>
              <CardHeader>
                <CardTitle>Top Improvement Opportunities</CardTitle>
                <CardDescription>Highest impact actions to improve code quality</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {improvementOpportunities.map((opportunity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <opportunity.icon className={`h-5 w-5 ${opportunity.iconColor} mt-0.5`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold">{opportunity.title}</div>
                          <Badge variant={opportunity.impactVariant}>{opportunity.impact}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {opportunity.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Current: {opportunity.current}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-green-600 font-medium">
                            Target: {opportunity.target}
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

        {/* Predictions Section */}
        {activeSection === 'predictions' && (
          <div className="space-y-4">
            {/* Predictive Analytics - Forecast Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CPU Usage Forecast */}
              <Card>
                <CardHeader>
                  <CardTitle>CPU Usage Forecast</CardTitle>
                  <CardDescription>Historical usage and 3-day prediction</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsLineChart data={cpuForecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis
                        className="text-xs"
                        domain={[0, 100]}
                        label={{ value: 'CPU %', angle: -90, position: 'insideLeft' }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <ReferenceLine y={80} stroke="orange" strokeDasharray="5 5" label="Warning" />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        name="Actual"
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Predicted"
                        dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                        connectNulls={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="text-2xl font-bold">68%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">3-Day Forecast</div>
                      <div className="text-2xl font-bold text-orange-500">71%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Trend</div>
                      <div className="text-2xl font-bold text-orange-500">↗ +4.4%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Memory Usage Forecast */}
              <Card>
                <CardHeader>
                  <CardTitle>Memory Usage Prediction</CardTitle>
                  <CardDescription>Memory growth rate and forecast</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsLineChart data={memoryForecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis
                        className="text-xs"
                        domain={[0, 100]}
                        label={{ value: 'Memory %', angle: -90, position: 'insideLeft' }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <ReferenceLine y={85} stroke="red" strokeDasharray="5 5" label="Critical" />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        name="Actual"
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Predicted"
                        dot={{ r: 4, fill: 'hsl(var(--chart-2))' }}
                        connectNulls={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="text-2xl font-bold">78%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">3-Day Forecast</div>
                      <div className="text-2xl font-bold text-red-500">83%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Trend</div>
                      <div className="text-2xl font-bold text-red-500">↗ +6.4%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Error Rate Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Error Rate Trend</CardTitle>
                  <CardDescription>Error frequency prediction</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsLineChart data={errorRateForecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis
                        className="text-xs"
                        domain={[0, 5]}
                        label={{ value: 'Error %', angle: -90, position: 'insideLeft' }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <ReferenceLine
                        y={3}
                        stroke="orange"
                        strokeDasharray="5 5"
                        label="Threshold"
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="hsl(var(--chart-3))"
                        strokeWidth={2}
                        name="Actual"
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="hsl(var(--chart-3))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Predicted"
                        dot={{ r: 4, fill: 'hsl(var(--chart-3))' }}
                        connectNulls={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="text-2xl font-bold">1.5%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">3-Day Forecast</div>
                      <div className="text-2xl font-bold text-orange-500">2.0%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Trend</div>
                      <div className="text-2xl font-bold text-orange-500">↗ +33%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Response Time Forecast */}
              <Card>
                <CardHeader>
                  <CardTitle>Response Time Forecast</CardTitle>
                  <CardDescription>Latency trend analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RechartsLineChart data={responseTimeForecastData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis
                        className="text-xs"
                        domain={[0, 100]}
                        label={{ value: 'Response (ms)', angle: -90, position: 'insideLeft' }}
                      />
                      <RechartsTooltip />
                      <Legend />
                      <ReferenceLine y={60} stroke="orange" strokeDasharray="5 5" label="Target" />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="hsl(var(--chart-4))"
                        strokeWidth={2}
                        name="Actual"
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="hsl(var(--chart-4))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Predicted"
                        dot={{ r: 4, fill: 'hsl(var(--chart-4))' }}
                        connectNulls={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Current</div>
                      <div className="text-2xl font-bold">45ms</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">3-Day Forecast</div>
                      <div className="text-2xl font-bold text-orange-500">50ms</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Trend</div>
                      <div className="text-2xl font-bold text-orange-500">↗ +11%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Anomaly Detection */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Anomaly Detection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Anomaly Detection
                      </CardTitle>
                      <CardDescription>Active alerts and detected anomalies</CardDescription>
                    </div>
                    <Badge variant={anomalies.length > 0 ? 'destructive' : 'default'}>
                      {anomalies.length} Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {anomalies.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <div className="text-lg font-semibold mb-2">All Systems Normal</div>
                      <p className="text-sm text-muted-foreground">
                        No anomalies detected in the last 24 hours
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {anomalies.map((anomaly) => {
                        const statusConfig = {
                          critical: {
                            icon: AlertTriangle,
                            color: 'text-red-500',
                            bg: 'bg-red-500/10 border-red-500/20',
                          },
                          warning: {
                            icon: AlertCircle,
                            color: 'text-orange-500',
                            bg: 'bg-orange-500/10 border-orange-500/20',
                          },
                          error: {
                            icon: XCircle,
                            color: 'text-red-600',
                            bg: 'bg-red-600/10 border-red-600/20',
                          },
                        };

                        const config =
                          statusConfig[anomaly.status as 'critical' | 'warning' | 'error'];
                        const Icon = config.icon;

                        return (
                          <div key={anomaly.id} className={`p-4 rounded-lg border ${config.bg}`}>
                            <div className="flex items-start gap-3">
                              <Icon className={`h-5 w-5 ${config.color} mt-0.5`} />
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-semibold">{anomaly.metric}</div>
                                  <Badge
                                    variant={
                                      anomaly.status === 'critical' ? 'destructive' : 'outline'
                                    }
                                  >
                                    {anomaly.severity.toUpperCase()}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                                  <div>
                                    <span className="text-muted-foreground">Current: </span>
                                    <span className={`font-medium ${config.color}`}>
                                      {anomaly.currentValue}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Expected: </span>
                                    <span className="font-medium">{anomaly.expectedValue}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Deviation: </span>
                                    <span className="font-medium">+{anomaly.deviation}%</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Machine: </span>
                                    <span className="font-mono text-xs">{anomaly.machine}</span>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Detected{' '}
                                  {formatDistanceToNow(anomaly.detectedAt, { addSuffix: true })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Routing & Patterns Section */}
        {activeSection === 'routing' && (
          <div className="space-y-4">
            {/* Routing Accuracy & Cache Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help flex items-center gap-1">
                          <CardTitle className="text-sm font-medium">Routing Accuracy</CardTitle>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p>
                            <strong>Routing Accuracy:</strong> Percentage of queries correctly
                            routed to optimal agent
                          </p>
                          <div className="pt-2 border-t">
                            <p>Fallback rate: {routingMetrics.fallbackRate}%</p>
                            <p className="text-muted-foreground">
                              Lower fallback rate indicates better routing decisions
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{routingMetrics.accuracy.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    Fallback rate: {routingMetrics.fallbackRate.toFixed(1)}%
                  </p>
                  <Progress value={routingMetrics.accuracy} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help flex items-center gap-1">
                          <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p>
                            <strong>What's being cached:</strong>
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Agent routing decisions (45% of hits)</li>
                            <li>Pattern lookup results (30% of hits)</li>
                            <li>Manifest templates (15% of hits)</li>
                            <li>Intelligence queries (10% of hits)</li>
                          </ul>
                          <div className="mt-2 pt-2 border-t space-y-1">
                            <p>Cache size: 1,240 entries</p>
                            <p>Avg hit latency: 2.3ms</p>
                            <p>Memory usage: 45MB</p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {routingMetrics.cacheHitRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">Target: 80%+</p>
                  <Progress value={routingMetrics.cacheHitRate} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help flex items-center gap-1">
                          <CardTitle className="text-sm font-medium">Avg Routing Time</CardTitle>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-xs">
                          <p>
                            <strong>Routing Time:</strong> Average time to select optimal agent for
                            query
                          </p>
                          <div className="pt-2 border-t">
                            <p>p95 percentile: {routingMetrics.avgRoutingTime * 2}ms</p>
                            <p>Target: &lt; 20ms</p>
                            <p className="text-muted-foreground">
                              Includes pattern matching, confidence scoring, and selection
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{routingMetrics.avgRoutingTime}ms</div>
                  <p className="text-xs text-muted-foreground">
                    p95: {routingMetrics.avgRoutingTime * 2}ms
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Pattern Injection Uplift Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Pattern Injection Uplift</CardTitle>
                <CardDescription>Impact of pattern injection on agent performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {routingMetrics.patternInjectionUplift}%
                      </div>
                      <div className="text-sm text-muted-foreground">Token Reduction</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {patternUplift.avgResponseTimeImprovement}%
                      </div>
                      <div className="text-sm text-muted-foreground">Response Time Improvement</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {patternUplift.avgSuccessRateIncrease}%
                      </div>
                      <div className="text-sm text-muted-foreground">Success Rate Increase</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {patternUplift.totalPatternsInjected.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Injections</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-3">Top Impacted Agents</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {patternUplift.topImpactedAgents.map((agent, index) => (
                        <Card
                          key={index}
                          className="cursor-pointer hover:border-primary transition-colors"
                          onClick={() => {
                            // TODO: Add drill-down modal
                            console.warn('Show details for:', agent.agent);
                          }}
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">{agent.agent}</CardTitle>
                            <CardDescription>Pattern injection impact</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-2xl font-bold text-green-600">
                                  +{agent.uplift}%
                                </span>
                                <Badge variant="secondary">Performance Uplift</Badge>
                              </div>
                              <div className="text-sm space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Tokens Saved:</span>
                                  <span className="font-medium">
                                    {Math.round(agent.uplift * 30)} tokens/run
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Patterns Used:</span>
                                  <span className="font-medium">
                                    {Math.round(agent.uplift / 3)} patterns
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Runs Affected:</span>
                                  <span className="font-medium">
                                    {Math.round(agent.uplift * 6)} runs
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pattern Impact Analysis Table */}
            <Card>
              <CardHeader>
                <CardTitle>Pattern Impact Analysis</CardTitle>
                <CardDescription>
                  Detailed breakdown of individual pattern contributions to performance improvements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pattern Name</TableHead>
                      <TableHead>Token Reduction</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Usage Count</TableHead>
                      <TableHead>Impact Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patternImpactData.map((pattern) => (
                      <TableRow
                        key={pattern.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          // TODO: Add pattern drill-down
                          console.warn('Show pattern details:', pattern.name);
                        }}
                      >
                        <TableCell className="font-medium">{pattern.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <span>-{pattern.tokenReduction} tokens</span>
                            <Badge variant="secondary">{pattern.tokenReductionPercent}%</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <span>-{pattern.responseTime}ms</span>
                            <Badge variant="secondary">{pattern.responseTimePercent}%</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <span>+{pattern.successRateIncrease}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{pattern.usageCount.toLocaleString()} times</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pattern.impactScore} className="w-20" />
                            <span className="text-sm font-bold">{pattern.impactScore}/100</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Optimization Section */}
        {activeSection === 'optimization' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Optimization Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5" />
                    Optimization Recommendations
                  </CardTitle>
                  <CardDescription>AI-powered optimization suggestions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {optimizationRecommendations.map((rec, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{rec.title}</h4>
                          <Badge
                            variant={
                              rec.priority === 'high'
                                ? 'destructive'
                                : rec.priority === 'medium'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.impact}</p>
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

              {/* Resource Utilization */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Resource Utilization
                  </CardTitle>
                  <CardDescription>Current resource usage and efficiency metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">CPU Efficiency</span>
                      <div className="flex items-center gap-2">
                        <Progress value={78} className="w-20" />
                        <span className="text-sm text-muted-foreground">78%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Memory Efficiency</span>
                      <div className="flex items-center gap-2">
                        <Progress value={65} className="w-20" />
                        <span className="text-sm text-muted-foreground">65%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Storage Efficiency</span>
                      <div className="flex items-center gap-2">
                        <Progress value={82} className="w-20" />
                        <span className="text-sm text-muted-foreground">82%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Network Efficiency</span>
                      <div className="flex items-center gap-2">
                        <Progress value={71} className="w-20" />
                        <span className="text-sm text-muted-foreground">71%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Default export wrapper for route usage (no props required)
export default function EnhancedAnalyticsRoute() {
  return <EnhancedAnalytics />;
}

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Users, 
  Clock, 
  Zap,
  Target,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  Filter,
  Settings,
  Brain,
  Shield,
  DollarSign,
  Layers,
  Eye,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  AlertCircle,
  Lightbulb,
  BarChart,
  PieChart,
  LineChart
} from "lucide-react";

export default function EnhancedAnalytics() {
  const [timeRange, setTimeRange] = useState("24h");
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("performance");

  // Mock data for demonstration
  const systemMetrics = {
    totalRequests: 1247,
    avgResponseTime: 45,
    successRate: 98.5,
    activeUsers: 23,
    errorRate: 1.5,
    throughput: 52.3,
    aiModelCosts: 234.50,
    codeQualityScore: 87,
    securityScore: 95,
    testCoverage: 92
  };

  // AI Model Performance Data
  const aiModelPerformance = [
    { model: "Claude-3.5-Sonnet", requests: 456, avgResponseTime: 1.2, cost: 89.50, successRate: 98.8, tokens: 125000 },
    { model: "Mixtral-8x7B", requests: 234, avgResponseTime: 2.1, cost: 45.20, successRate: 96.5, tokens: 89000 },
    { model: "DeepSeek-Coder", requests: 189, avgResponseTime: 0.8, cost: 32.10, successRate: 99.2, tokens: 67000 },
    { model: "GPT-4", requests: 156, avgResponseTime: 1.5, cost: 67.70, successRate: 97.8, tokens: 98000 }
  ];

  // Predictive Analytics Data
  const predictions = [
    { metric: "CPU Usage", current: 65, predicted: 78, confidence: 0.85, trend: "increasing" },
    { metric: "Memory Usage", current: 78, predicted: 82, confidence: 0.92, trend: "increasing" },
    { metric: "Response Time", current: 45, predicted: 52, confidence: 0.78, trend: "increasing" },
    { metric: "Error Rate", current: 1.5, predicted: 2.1, confidence: 0.88, trend: "increasing" }
  ];

  // Code Quality Metrics
  const codeQualityDetails = [
    { metric: "Cyclomatic Complexity", value: 12, threshold: 15, status: "good" },
    { metric: "Code Duplication", value: 8, threshold: 10, status: "good" },
    { metric: "Technical Debt", value: 23, threshold: 30, status: "warning" },
    { metric: "Test Coverage", value: 92, threshold: 80, status: "excellent" },
    { metric: "Security Vulnerabilities", value: 2, threshold: 5, status: "good" },
    { metric: "Performance Issues", value: 5, threshold: 10, status: "good" }
  ];

  // Resource Optimization Recommendations
  const optimizationRecommendations = [
    { type: "cost", title: "Switch to Mixtral for Code Generation", impact: "Save $45/month", priority: "high" },
    { type: "performance", title: "Enable Response Caching", impact: "Reduce latency by 30%", priority: "medium" },
    { type: "scaling", title: "Add 2 more instances", impact: "Handle 40% more load", priority: "low" },
    { type: "efficiency", title: "Optimize Database Queries", impact: "Reduce CPU usage by 15%", priority: "medium" }
  ];

  const performanceTrends = [
    { time: "00:00", requests: 45, responseTime: 42, errors: 1 },
    { time: "04:00", requests: 32, responseTime: 38, errors: 0 },
    { time: "08:00", requests: 89, responseTime: 45, errors: 2 },
    { time: "12:00", requests: 156, responseTime: 48, errors: 3 },
    { time: "16:00", requests: 203, responseTime: 52, errors: 1 },
    { time: "20:00", requests: 178, responseTime: 46, errors: 2 },
  ];

  const topAgents = [
    { name: "agent-performance", requests: 234, successRate: 99.2, avgTime: 38 },
    { name: "agent-database", requests: 189, successRate: 97.8, avgTime: 52 },
    { name: "agent-debug", requests: 156, successRate: 96.5, avgTime: 67 },
    { name: "agent-api", requests: 134, successRate: 98.9, avgTime: 41 },
    { name: "agent-security", requests: 98, successRate: 99.5, avgTime: 29 },
  ];

  const qualityMetrics = [
    { metric: "Code Quality", value: 87, trend: "+5%", status: "improving" },
    { metric: "Test Coverage", value: 92, trend: "+2%", status: "excellent" },
    { metric: "Performance", value: 78, trend: "-1%", status: "needs_attention" },
    { metric: "Security", value: 95, trend: "+3%", status: "excellent" },
    { metric: "Maintainability", value: 83, trend: "+4%", status: "good" },
  ];

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enhanced Analytics</h1>
          <p className="text-muted-foreground">
            Advanced analytics and insights for the OmniNode platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Time Range:</span>
        <div className="flex gap-1">
          {["1h", "24h", "7d", "30d"].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange(range)}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics.totalRequests.toLocaleString()}</div>
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

      {/* Main Analytics Sections */}
      <div className="space-y-4">
        <div className="flex gap-2 mb-4">
          <Button 
            variant={activeSection === "performance" ? "default" : "outline"} 
            size="sm"
            onClick={() => setActiveSection("performance")}
          >
            <BarChart className="w-4 h-4 mr-2" />
            Performance
          </Button>
          <Button 
            variant={activeSection === "ai-models" ? "default" : "outline"} 
            size="sm"
            onClick={() => setActiveSection("ai-models")}
          >
            <Brain className="w-4 h-4 mr-2" />
            AI Models
          </Button>
          <Button 
            variant={activeSection === "quality" ? "default" : "outline"} 
            size="sm"
            onClick={() => setActiveSection("quality")}
          >
            <Shield className="w-4 h-4 mr-2" />
            Quality
          </Button>
          <Button 
            variant={activeSection === "predictions" ? "default" : "outline"} 
            size="sm"
            onClick={() => setActiveSection("predictions")}
          >
            <Eye className="w-4 h-4 mr-2" />
            Predictions
          </Button>
          <Button 
            variant={activeSection === "optimization" ? "default" : "outline"} 
            size="sm"
            onClick={() => setActiveSection("optimization")}
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Optimization
          </Button>
        </div>

        {/* Performance Section */}
        {activeSection === "performance" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance Trends Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Performance Trends</CardTitle>
                  <CardDescription>Request volume and response times over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {performanceTrends.map((data, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{data.time}</span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full" 
                                style={{ width: `${(data.requests / 250) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{data.requests}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ width: `${(data.responseTime / 60) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{data.responseTime}ms</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {data.errors > 0 ? (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                            <span className="text-xs text-muted-foreground">{data.errors}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* System Health */}
              <Card>
                <CardHeader>
                  <CardTitle>System Health</CardTitle>
                  <CardDescription>Current system status and health indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">CPU Usage</span>
                      <div className="flex items-center gap-2">
                        <Progress value={65} className="w-20" />
                        <span className="text-sm text-muted-foreground">65%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <div className="flex items-center gap-2">
                        <Progress value={78} className="w-20" />
                        <span className="text-sm text-muted-foreground">78%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Disk Usage</span>
                      <div className="flex items-center gap-2">
                        <Progress value={45} className="w-20" />
                        <span className="text-sm text-muted-foreground">45%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Network I/O</span>
                      <div className="flex items-center gap-2">
                        <Progress value={32} className="w-20" />
                        <span className="text-sm text-muted-foreground">32%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* AI Models Section */}
        {activeSection === "ai-models" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* AI Model Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    AI Model Performance
                  </CardTitle>
                  <CardDescription>Performance comparison across different AI models</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {aiModelPerformance.map((model, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{model.model}</h4>
                          <Badge variant={model.successRate > 98 ? "default" : "secondary"}>
                            {model.successRate}% success
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Requests:</span>
                            <span className="ml-2 font-medium">{model.requests}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Avg Time:</span>
                            <span className="ml-2 font-medium">{model.avgResponseTime}s</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cost:</span>
                            <span className="ml-2 font-medium">${model.cost}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tokens:</span>
                            <span className="ml-2 font-medium">{model.tokens.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Cost Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Cost Analysis
                  </CardTitle>
                  <CardDescription>AI model cost breakdown and optimization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total AI Costs (24h)</span>
                      <span className="text-2xl font-bold">${systemMetrics.aiModelCosts}</span>
                    </div>
                    <div className="space-y-2">
                      {aiModelPerformance.map((model, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm">{model.model}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-muted rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full" 
                                style={{ width: `${(model.cost / systemMetrics.aiModelCosts) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">${model.cost}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Quality Section */}
        {activeSection === "quality" && (
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
                  <div className="space-y-4">
                    {codeQualityDetails.map((metric, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{metric.metric}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{metric.value}</span>
                            <Badge 
                              variant={
                                metric.status === "excellent" ? "default" : 
                                metric.status === "good" ? "secondary" : 
                                "destructive"
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
                          <span className="text-xs text-muted-foreground">/{metric.threshold}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Security & Test Coverage */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Security & Coverage
                  </CardTitle>
                  <CardDescription>Security score and test coverage analysis</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Security Score</span>
                      <div className="flex items-center gap-2">
                        <Progress value={systemMetrics.securityScore} className="w-20" />
                        <span className="text-sm font-bold">{systemMetrics.securityScore}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Test Coverage</span>
                      <div className="flex items-center gap-2">
                        <Progress value={systemMetrics.testCoverage} className="w-20" />
                        <span className="text-sm font-bold">{systemMetrics.testCoverage}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Code Quality</span>
                      <div className="flex items-center gap-2">
                        <Progress value={systemMetrics.codeQualityScore} className="w-20" />
                        <span className="text-sm font-bold">{systemMetrics.codeQualityScore}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Predictions Section */}
        {activeSection === "predictions" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Predictive Analytics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Predictive Analytics
                  </CardTitle>
                  <CardDescription>ML-powered predictions and trend analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {predictions.map((prediction, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{prediction.metric}</h4>
                          <Badge variant={prediction.trend === "increasing" ? "destructive" : "default"}>
                            {prediction.trend}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Current:</span>
                            <span className="font-medium">{prediction.current}%</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Predicted:</span>
                            <span className="font-medium">{prediction.predicted}%</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Confidence:</span>
                            <span className="font-medium">{(prediction.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Anomaly Detection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Anomaly Detection
                  </CardTitle>
                  <CardDescription>Real-time anomaly detection and alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">CPU spike detected</span>
                      </div>
                      <Badge variant="secondary">Warning</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">Memory usage normal</span>
                      </div>
                      <Badge variant="default">Normal</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">Response time anomaly</span>
                      </div>
                      <Badge variant="destructive">Critical</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Optimization Section */}
        {activeSection === "optimization" && (
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
                              rec.priority === "high" ? "destructive" : 
                              rec.priority === "medium" ? "secondary" : 
                              "outline"
                            }
                          >
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.impact}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">Apply</Button>
                          <Button size="sm" variant="ghost">Learn More</Button>
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

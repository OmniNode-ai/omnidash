import React, { useState } from "react";
import { MockDataBadge } from "@/components/MockDataBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TechDebtDetailModal } from "@/components/TechDebtDetailModal";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  DollarSign,
  Target,
  BarChart3,
  PieChart,
  LineChart,
  Zap,
  RefreshCw,
  Eye,
  Download,
  Filter,
  Search,
  ArrowUp,
  ArrowDown,
  Minus,
  Activity,
  Code,
  Layers,
  Database,
  Cpu,
  HardDrive
} from "lucide-react";

interface TechDebtMetric {
  name: string;
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  unit: string;
}

interface RefactoringOpportunity {
  id: string;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high' | 'extreme';
  timeEstimate: string;
  costSavings: number;
  complexity: number;
  files: string[];
  patterns: string[];
  priority: number;
  category: string;
}

interface DuplicatePattern {
  id: string;
  pattern: string;
  occurrences: number;
  files: string[];
  similarity: number;
  replacement: string;
  upgradePath: string;
}

const TechDebtAnalysis: React.FC = () => {
  const [activeSection, setActiveSection] = useState("overview");
  const [selectedTimeframe, setSelectedTimeframe] = useState("30d");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedOpportunity, setSelectedOpportunity] = useState<RefactoringOpportunity | null>(null);

  // Mock data for tech debt metrics
  const techDebtMetrics: TechDebtMetric[] = [
    {
      name: "Code Complexity",
      current: 7.2,
      previous: 7.8,
      trend: 'down',
      severity: 'high',
      unit: "avg cyclomatic"
    },
    {
      name: "Test Coverage",
      current: 78,
      previous: 72,
      trend: 'up',
      severity: 'medium',
      unit: "%"
    },
    {
      name: "Technical Debt Ratio",
      current: 15.3,
      previous: 18.7,
      trend: 'down',
      severity: 'medium',
      unit: "%"
    },
    {
      name: "Legacy Code",
      current: 23,
      previous: 28,
      trend: 'down',
      severity: 'high',
      unit: "%"
    },
    {
      name: "Dependency Vulnerabilities",
      current: 3,
      previous: 7,
      trend: 'down',
      severity: 'low',
      unit: "count"
    },
    {
      name: "Performance Score",
      current: 85,
      previous: 78,
      trend: 'up',
      severity: 'low',
      unit: "/100"
    }
  ];

  // Mock data for refactoring opportunities
  const refactoringOpportunities: RefactoringOpportunity[] = [
    {
      id: "1",
      title: "Consolidate Authentication Logic",
      description: "Merge 5 similar authentication implementations into a single service",
      impact: 'high',
      effort: 'medium',
      timeEstimate: "2-3 days",
      costSavings: 45000,
      complexity: 6,
      files: ["auth-service.ts", "user-auth.ts", "login-handler.ts", "session-manager.ts", "token-validator.ts"],
      patterns: ["Authentication", "Session Management"],
      priority: 1,
      category: "Code Consolidation"
    },
    {
      id: "2",
      title: "Upgrade Database Connection Pool",
      description: "Replace legacy connection pooling with modern implementation",
      impact: 'critical',
      effort: 'high',
      timeEstimate: "1-2 weeks",
      costSavings: 120000,
      complexity: 8,
      files: ["db-pool.ts", "connection-manager.ts", "query-executor.ts"],
      patterns: ["Database Connection", "Connection Pooling"],
      priority: 2,
      category: "Performance"
    },
    {
      id: "3",
      title: "Extract Common Validation Logic",
      description: "Create reusable validation patterns for form inputs",
      impact: 'medium',
      effort: 'low',
      timeEstimate: "1-2 days",
      costSavings: 15000,
      complexity: 3,
      files: ["user-form.ts", "product-form.ts", "order-form.ts", "contact-form.ts"],
      patterns: ["Form Validation", "Input Validation"],
      priority: 3,
      category: "Code Reuse"
    },
    {
      id: "4",
      title: "Modernize Error Handling",
      description: "Replace scattered try-catch blocks with centralized error handling",
      impact: 'high',
      effort: 'medium',
      timeEstimate: "3-4 days",
      costSavings: 35000,
      complexity: 7,
      files: ["api-handler.ts", "service-layer.ts", "controller.ts", "middleware.ts"],
      patterns: ["Error Handling", "Exception Management"],
      priority: 4,
      category: "Code Quality"
    }
  ];

  // Mock data for duplicate patterns
  const duplicatePatterns: DuplicatePattern[] = [
    {
      id: "1",
      pattern: "API Response Wrapper",
      occurrences: 12,
      files: ["user-api.ts", "product-api.ts", "order-api.ts", "payment-api.ts"],
      similarity: 95,
      replacement: "StandardResponse<T>",
      upgradePath: "Use ResponseBuilder pattern from library"
    },
    {
      id: "2",
      pattern: "Database Query Builder",
      occurrences: 8,
      files: ["user-queries.ts", "product-queries.ts", "order-queries.ts"],
      similarity: 88,
      replacement: "QueryBuilder<T>",
      upgradePath: "Migrate to ORM query builder"
    },
    {
      id: "3",
      pattern: "Cache Invalidation",
      occurrences: 6,
      files: ["user-cache.ts", "product-cache.ts", "session-cache.ts"],
      similarity: 92,
      replacement: "CacheManager.invalidate()",
      upgradePath: "Use centralized cache invalidation service"
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUp className="w-4 h-4 text-green-500" />;
      case 'down': return <ArrowDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'extreme': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const calculateROI = (savings: number, effort: string) => {
    const effortMultiplier = {
      'low': 1,
      'medium': 2,
      'high': 4,
      'extreme': 8
    };
    return Math.round(savings / effortMultiplier[effort as keyof typeof effortMultiplier]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tech Debt Analysis</h1>
          <p className="ty-subtitle">
            Monitor technical debt trends and identify optimization opportunities
          </p>
        </div>
        <div className="flex gap-2">
          <MockDataBadge />
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant={activeSection === "overview" ? "default" : "outline"} 
          onClick={() => setActiveSection("overview")}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Overview
        </Button>
        <Button 
          variant={activeSection === "opportunities" ? "default" : "outline"} 
          onClick={() => setActiveSection("opportunities")}
        >
          <Target className="w-4 h-4 mr-2" />
          Opportunities
        </Button>
        <Button 
          variant={activeSection === "duplicates" ? "default" : "outline"} 
          onClick={() => setActiveSection("duplicates")}
        >
          <Code className="w-4 h-4 mr-2" />
          Duplicates
        </Button>
        <Button 
          variant={activeSection === "patterns" ? "default" : "outline"} 
          onClick={() => setActiveSection("patterns")}
        >
          <Layers className="w-4 h-4 mr-2" />
          Pattern Analysis
        </Button>
        <Button 
          variant={activeSection === "timeline" ? "default" : "outline"} 
          onClick={() => setActiveSection("timeline")}
        >
          <LineChart className="w-4 h-4 mr-2" />
          Timeline
        </Button>
      </div>

      {/* Overview Section */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {techDebtMetrics.map((metric, index) => (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{metric.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(metric.trend)}
                    <Badge variant={getSeverityColor(metric.severity)}>
                      {metric.severity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metric.current}{metric.unit}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    {metric.trend === 'up' ? '+' : ''}{((metric.current - metric.previous) / metric.previous * 100).toFixed(1)}% from last period
                  </div>
                  <Progress 
                    value={metric.severity === 'critical' ? 100 : metric.severity === 'high' ? 75 : metric.severity === 'medium' ? 50 : 25} 
                    className="mt-2" 
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tech Debt Health Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Overall Tech Debt Health Score
              </CardTitle>
              <CardDescription>
                Calculated based on code quality, test coverage, and maintainability metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">72/100</span>
                  <Badge variant="default">Good</Badge>
                </div>
                <Progress value={72} className="h-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-green-600">Code Quality</div>
                    <div>85/100</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-yellow-600">Test Coverage</div>
                    <div>78/100</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-blue-600">Maintainability</div>
                    <div>65/100</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-purple-600">Performance</div>
                    <div>85/100</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 3 to Fix Next */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Top 3 to Fix Next
              </CardTitle>
              <CardDescription>
                Highest priority refactoring opportunities ranked by impact and ROI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {refactoringOpportunities.slice(0, 3).map((opp, index) => (
                  <div key={opp.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{opp.title}</h4>
                            <Badge variant={getImpactColor(opp.impact)}>{opp.impact}</Badge>
                            <Badge variant="outline">{opp.category}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{opp.description}</p>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Est. Time:</span>
                              <span className="font-semibold">{opp.timeEstimate}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-green-600" />
                              <span className="text-muted-foreground">Savings:</span>
                              <span className="font-semibold text-green-600">
                                ${opp.costSavings.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="text-xs text-muted-foreground mb-1">Repository Path:</div>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {opp.files[0]?.split('/').slice(0, -1).join('/') || 'N/A'}
                            </code>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOpportunity(opp)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Opportunities Section */}
      {activeSection === "opportunities" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Refactoring Opportunities</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {refactoringOpportunities.map((opportunity) => (
              <Card key={opportunity.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {opportunity.title}
                        <Badge variant={getImpactColor(opportunity.impact)}>
                          {opportunity.impact} impact
                        </Badge>
                        <Badge variant={getEffortColor(opportunity.effort)}>
                          {opportunity.effort} effort
                        </Badge>
                      </CardTitle>
                      <CardDescription>{opportunity.description}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        ${opportunity.costSavings.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Potential Savings</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Time Estimate</div>
                      <div className="font-semibold">{opportunity.timeEstimate}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Complexity</div>
                      <div className="font-semibold">{opportunity.complexity}/10</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">ROI Score</div>
                      <div className="font-semibold">{calculateROI(opportunity.costSavings, opportunity.effort)}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Files Affected</div>
                      <div className="font-semibold">{opportunity.files.length}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Affected Files:</div>
                    <div className="flex flex-wrap gap-1">
                      {opportunity.files.map((file, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {file}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Patterns:</div>
                    <div className="flex flex-wrap gap-1">
                      {opportunity.patterns.map((pattern, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={() => setSelectedOpportunity(opportunity)}>
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                    <Button variant="outline" size="sm">
                      <Zap className="w-4 h-4 mr-2" />
                      Start Refactoring
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Duplicates Section */}
      {activeSection === "duplicates" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Duplicate Code Detection</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Rescan
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {duplicatePatterns.map((duplicate) => (
              <Card key={duplicate.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{duplicate.pattern}</span>
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {duplicate.occurrences} occurrences
                      </Badge>
                      <Badge variant={duplicate.similarity > 90 ? "destructive" : "default"}>
                        {duplicate.similarity}% similar
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Affected Files:</div>
                      <div className="flex flex-wrap gap-1">
                        {duplicate.files.map((file, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {file}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-1">Recommended Replacement:</div>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {duplicate.replacement}
                        </code>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-1">Upgrade Path:</div>
                        <div className="text-sm text-muted-foreground">
                          {duplicate.upgradePath}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm">
                        <Code className="w-4 h-4 mr-2" />
                        View Duplicates
                      </Button>
                      <Button variant="outline" size="sm">
                        <Zap className="w-4 h-4 mr-2" />
                        Auto-Refactor
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Generate Plan
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pattern Analysis Section */}
      {activeSection === "patterns" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Pattern Analysis</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Layers className="w-5 h-5 mr-2" />
                  Pattern Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Authentication</span>
                    <span className="font-semibold">15 uses</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Error Handling</span>
                    <span className="font-semibold">23 uses</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Validation</span>
                    <span className="font-semibold">31 uses</span>
                  </div>
                  <div className="flex justify-between">
                    <span>API Response</span>
                    <span className="font-semibold">18 uses</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  Pattern Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Up to Date</span>
                    <Badge variant="default">12</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Needs Update</span>
                    <Badge variant="destructive">3</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Deprecated</span>
                    <Badge variant="secondary">1</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cpu className="w-5 h-5 mr-2" />
                  Performance Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>High Performance</span>
                    <span className="text-green-600 font-semibold">8</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Medium Performance</span>
                    <span className="text-yellow-600 font-semibold">5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Low Performance</span>
                    <span className="text-red-600 font-semibold">2</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Timeline Section */}
      {activeSection === "timeline" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Tech Debt Timeline</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Debt Accumulation Over Time</CardTitle>
              <CardDescription>
                Track how technical debt has evolved over the past 12 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <div className="text-center">
                  <LineChart className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Timeline visualization would go here</p>
                  <p className="text-sm text-muted-foreground">
                    Interactive chart showing debt trends, refactoring milestones, and quality improvements
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <TechDebtDetailModal
        opportunity={selectedOpportunity}
        isOpen={!!selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
      />
    </div>
  );
};

export default TechDebtAnalysis;

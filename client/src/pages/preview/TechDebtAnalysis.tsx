import React, { useState } from "react";
import { MockDataBadge } from "@/components/MockDataBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TechDebtDetailModal } from "@/components/TechDebtDetailModal";
import { SavingsTooltip } from "@/components/SavingsTooltip";
import { DuplicateDetailModal } from "@/components/DuplicateDetailModal";
import { RefactorPlanModal } from "@/components/RefactorPlanModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
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
  HardDrive,
  Copy,
  FileText,
  GitBranch,
  Settings,
  Network,
  Shield,
  Lightbulb
} from "lucide-react";

interface TechDebtMetric {
  name: string;
  current: number;
  previous: number;
  trend: 'up' | 'down' | 'stable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  unit: string;
}

export interface RefactoringOpportunity {
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
  suggestedApproach: string;
  risks: string[];
  benefits: string[];
  dependencies: string[];
  testCoverage: number;
  lastModified: string;
  author: string;
  priority: number;
  category: string;
  technicalDebt: number;
  maintainability: number;
  performance: number;
  security: number;
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

// Interfaces from DuplicateDetection
interface DuplicateCode {
  id: string;
  title: string;
  description: string;
  similarity: number;
  occurrences: number;
  totalLines: number;
  files: DuplicateFile[];
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  refactoringComplexity: number;
  estimatedSavings: number;
  timeToRefactor: string;
  patterns: string[];
  suggestedReplacement: string;
  upgradePath: string;
  bestImplementation?: string;
  clusterId?: string;
}

interface DuplicateFile {
  path: string;
  lines: number;
  startLine: number;
  endLine: number;
  lastModified: string;
  author: string;
  complexity: number;
  testCoverage: number;
}

interface PatternReplacement {
  id: string;
  fromPattern: string;
  toPattern: string;
  compatibility: number;
  migrationSteps: string[];
  benefits: string[];
  risks: string[];
  estimatedTime: string;
  testCases: string[];
}

interface RefactoringPlan {
  id: string;
  name: string;
  description: string;
  duplicates: string[];
  steps: RefactoringStep[];
  estimatedTime: string;
  estimatedSavings: number;
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites: string[];
  testPlan: string[];
}

interface RefactoringStep {
  id: string;
  description: string;
  order: number;
  estimatedTime: string;
  dependencies: string[];
  automated: boolean;
  files: string[];
}

const TechDebtAnalysis: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState("30d");
  const [selectedCategory, setSelectedCategory] = useState("patterns");
  const [selectedOpportunity, setSelectedOpportunity] = useState<RefactoringOpportunity | null>(null);

  // State for duplicate detection
  const [activeView, setActiveView] = useState("detection");
  const [searchTerm, setSearchTerm] = useState("");
  const [similarityThreshold, setSimilarityThreshold] = useState(80);
  const [selectedDuplicateCategory, setSelectedDuplicateCategory] = useState("all");
  const [showOnlyHighImpact, setShowOnlyHighImpact] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateCode | null>(null);
  const [showRefactorPlan, setShowRefactorPlan] = useState(false);

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
      suggestedApproach: "Create a unified authentication service and migrate existing implementations",
      risks: ["Breaking changes to existing auth flows", "Potential downtime during migration"],
      benefits: ["Reduced code duplication", "Easier maintenance", "Improved security"],
      dependencies: ["auth-library v2.0", "session-store"],
      testCoverage: 85,
      lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: "System Analysis",
      priority: 1,
      category: "Code Consolidation",
      technicalDebt: 7.5,
      maintainability: 65,
      performance: 85,
      security: 75,
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
      suggestedApproach: "Migrate to modern connection pool library with better performance",
      risks: ["Database downtime during migration", "Compatibility issues"],
      benefits: ["Better performance", "Reduced connection overhead", "Improved stability"],
      dependencies: ["pg-pool v3.0"],
      testCoverage: 72,
      lastModified: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      author: "System Analysis",
      priority: 2,
      category: "Performance",
      technicalDebt: 8.2,
      maintainability: 55,
      performance: 60,
      security: 80,
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
      suggestedApproach: "Create validation utility library with composable validators",
      risks: ["Minor breaking changes to form components"],
      benefits: ["Code reuse", "Consistent validation", "Easier testing"],
      dependencies: ["validator.js"],
      testCoverage: 90,
      lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      author: "System Analysis",
      priority: 3,
      category: "Code Reuse",
      technicalDebt: 4.5,
      maintainability: 75,
      performance: 90,
      security: 85,
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
      suggestedApproach: "Implement global error handler with custom error types",
      risks: ["Changes to error response format"],
      benefits: ["Consistent error handling", "Better error tracking", "Improved debugging"],
      dependencies: [],
      testCoverage: 78,
      lastModified: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      author: "System Analysis",
      priority: 4,
      category: "Code Quality",
      technicalDebt: 6.8,
      maintainability: 68,
      performance: 82,
      security: 78,
    }
  ];

  // Mock data for duplicate code detection
  const duplicateCode: DuplicateCode[] = [
    {
      id: "1",
      title: "API Response Wrapper",
      description: "Standard response formatting logic repeated across multiple API endpoints",
      similarity: 95,
      occurrences: 12,
      totalLines: 180,
      files: [
        { path: "src/api/products.ts", lines: 15, startLine: 32, endLine: 47, lastModified: "2024-01-14", author: "Jane Smith", complexity: 3, testCoverage: 90 },
        { path: "src/api/users.ts", lines: 15, startLine: 45, endLine: 60, lastModified: "2024-01-15", author: "John Doe", complexity: 3, testCoverage: 85 },
        { path: "src/api/payments.ts", lines: 15, startLine: 51, endLine: 66, lastModified: "2024-01-12", author: "Alice Brown", complexity: 3, testCoverage: 92 },
        { path: "src/api/orders.ts", lines: 15, startLine: 28, endLine: 43, lastModified: "2024-01-13", author: "Bob Johnson", complexity: 3, testCoverage: 78 }
      ],
      category: "API Design",
      severity: 'high',
      refactoringComplexity: 4,
      estimatedSavings: 25000,
      timeToRefactor: "2-3 days",
      patterns: ["Response Builder", "Error Handling"],
      suggestedReplacement: "StandardResponse<T> utility class",
      upgradePath: "Extract to shared utility and update all endpoints",
      bestImplementation: "src/api/payments.ts",
      clusterId: "cluster-1"
    },
    {
      id: "2",
      title: "Database Query Builder",
      description: "Similar query construction logic across different data access layers",
      similarity: 88,
      occurrences: 8,
      totalLines: 120,
      files: [
        { path: "src/db/user-queries.ts", lines: 15, startLine: 12, endLine: 27, lastModified: "2024-01-10", author: "John Doe", complexity: 6, testCoverage: 70 },
        { path: "src/db/product-queries.ts", lines: 15, startLine: 8, endLine: 23, lastModified: "2024-01-09", author: "Jane Smith", complexity: 6, testCoverage: 75 },
        { path: "src/db/order-queries.ts", lines: 15, startLine: 15, endLine: 30, lastModified: "2024-01-08", author: "Bob Johnson", complexity: 6, testCoverage: 65 }
      ],
      category: "Data Access",
      severity: 'medium',
      refactoringComplexity: 7,
      estimatedSavings: 18000,
      timeToRefactor: "1-2 weeks",
      patterns: ["Query Builder", "ORM Pattern"],
      suggestedReplacement: "Generic QueryBuilder<T> class",
      upgradePath: "Implement ORM query builder pattern"
    },
    {
      id: "3",
      title: "Form Validation Logic",
      description: "Client-side validation rules duplicated across multiple forms",
      similarity: 92,
      occurrences: 6,
      totalLines: 90,
      files: [
        { path: "src/components/UserForm.tsx", lines: 15, startLine: 25, endLine: 40, lastModified: "2024-01-05", author: "Alice Brown", complexity: 4, testCoverage: 88 },
        { path: "src/components/ProductForm.tsx", lines: 15, startLine: 30, endLine: 45, lastModified: "2024-01-04", author: "John Doe", complexity: 4, testCoverage: 85 },
        { path: "src/components/OrderForm.tsx", lines: 15, startLine: 20, endLine: 35, lastModified: "2024-01-03", author: "Jane Smith", complexity: 4, testCoverage: 90 }
      ],
      category: "UI Components",
      severity: 'medium',
      refactoringComplexity: 3,
      estimatedSavings: 12000,
      timeToRefactor: "1-2 days",
      patterns: ["Form Validation", "Schema Validation"],
      suggestedReplacement: "Reusable validation hook",
      upgradePath: "Create useValidation hook with schema-based rules"
    },
    {
      id: "4",
      title: "Error Handling Blocks",
      description: "Identical try-catch error handling patterns throughout the codebase",
      similarity: 85,
      occurrences: 15,
      totalLines: 225,
      files: [
        { path: "src/services/user-service.ts", lines: 15, startLine: 45, endLine: 60, lastModified: "2024-01-02", author: "Bob Johnson", complexity: 5, testCoverage: 80 },
        { path: "src/services/product-service.ts", lines: 15, startLine: 38, endLine: 53, lastModified: "2024-01-01", author: "Alice Brown", complexity: 5, testCoverage: 82 },
        { path: "src/services/order-service.ts", lines: 15, startLine: 52, endLine: 67, lastModified: "2023-12-30", author: "John Doe", complexity: 5, testCoverage: 78 }
      ],
      category: "Error Handling",
      severity: 'critical',
      refactoringComplexity: 6,
      estimatedSavings: 35000,
      timeToRefactor: "3-4 days",
      patterns: ["Error Handler", "Exception Management"],
      suggestedReplacement: "Centralized error handling middleware",
      upgradePath: "Implement global error handler with custom error types"
    }
  ];

  // Mock data for pattern replacements
  const patternReplacements: PatternReplacement[] = [
    {
      id: "1",
      fromPattern: "Manual API Response Building",
      toPattern: "ResponseBuilder Pattern",
      compatibility: 95,
      migrationSteps: [
        "Create ResponseBuilder utility class",
        "Update all API endpoints to use ResponseBuilder",
        "Remove duplicate response formatting code",
        "Add comprehensive tests for ResponseBuilder"
      ],
      benefits: [
        "Consistent API responses",
        "Reduced code duplication",
        "Easier maintenance",
        "Better error handling"
      ],
      risks: [
        "Breaking changes to existing API contracts",
        "Potential performance impact",
        "Testing overhead"
      ],
      estimatedTime: "2-3 days",
      testCases: [
        "Test all API endpoints return consistent format",
        "Verify error responses are properly formatted",
        "Performance regression testing"
      ]
    },
    {
      id: "2",
      fromPattern: "Raw Database Queries",
      toPattern: "ORM Query Builder",
      compatibility: 80,
      migrationSteps: [
        "Install and configure ORM library",
        "Create entity models",
        "Replace raw queries with ORM queries",
        "Update database connection handling",
        "Migrate existing data if needed"
      ],
      benefits: [
        "Type safety",
        "Query optimization",
        "Database abstraction",
        "Easier testing"
      ],
      risks: [
        "Learning curve for team",
        "Potential performance issues",
        "Migration complexity",
        "Breaking changes"
      ],
      estimatedTime: "1-2 weeks",
      testCases: [
        "Verify all queries return correct data",
        "Performance benchmarking",
        "Data integrity testing",
        "Migration rollback testing"
      ]
    }
  ];

  // Mock data for refactoring plans
  const refactoringPlans: RefactoringPlan[] = [
    {
      id: "1",
      name: "API Response Standardization",
      description: "Consolidate all API response formatting into a single utility",
      duplicates: ["1"],
      steps: [
        {
          id: "1",
          description: "Create ResponseBuilder utility class",
          order: 1,
          estimatedTime: "4 hours",
          dependencies: [],
          automated: true,
          files: ["src/utils/ResponseBuilder.ts"]
        },
        {
          id: "2",
          description: "Update user API endpoints",
          order: 2,
          estimatedTime: "2 hours",
          dependencies: ["1"],
          automated: false,
          files: ["src/api/users.ts"]
        },
        {
          id: "3",
          description: "Update product API endpoints",
          order: 3,
          estimatedTime: "2 hours",
          dependencies: ["1"],
          automated: false,
          files: ["src/api/products.ts"]
        },
        {
          id: "4",
          description: "Update remaining API endpoints",
          order: 4,
          estimatedTime: "4 hours",
          dependencies: ["1"],
          automated: false,
          files: ["src/api/orders.ts", "src/api/payments.ts"]
        },
        {
          id: "5",
          description: "Add comprehensive tests",
          order: 5,
          estimatedTime: "3 hours",
          dependencies: ["2", "3", "4"],
          automated: false,
          files: ["src/tests/ResponseBuilder.test.ts"]
        }
      ],
      estimatedTime: "2-3 days",
      estimatedSavings: 25000,
      riskLevel: 'low',
      prerequisites: [
        "Backup current codebase",
        "Ensure all tests are passing",
        "Review API contracts with frontend team"
      ],
      testPlan: [
        "Unit tests for ResponseBuilder",
        "Integration tests for all API endpoints",
        "Performance regression testing",
        "Manual API testing"
      ]
    }
  ];

  // Mock data for analytics charts
  const duplicatesByCategory = [
    { category: "Error Handling", count: 12, color: "hsl(var(--chart-1))" },
    { category: "API Logic", count: 8, color: "hsl(var(--chart-2))" },
    { category: "Database Queries", count: 6, color: "hsl(var(--chart-3))" },
    { category: "Form Validation", count: 4, color: "hsl(var(--chart-4))" },
    { category: "Cache Management", count: 3, color: "hsl(var(--chart-5))" }
  ];

  const refactoringProgressData = [
    { month: "Jun", duplicates: 58, resolved: 5 },
    { month: "Jul", duplicates: 53, resolved: 8 },
    { month: "Aug", duplicates: 45, resolved: 6 },
    { month: "Sep", duplicates: 39, resolved: 4 },
    { month: "Oct", duplicates: 35, resolved: 7 },
    { month: "Nov", duplicates: 33, resolved: 2 }
  ];

  const chartConfig = {
    duplicates: {
      label: "Duplicates",
      color: "hsl(var(--chart-1))"
    },
    resolved: {
      label: "Resolved",
      color: "hsl(var(--chart-2))"
    }
  };

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

  // Mock data for timeline chart (last 12 months)
  const timelineData = [
    { month: 'Nov 2024', debtRatio: 22.5, complexity: 8.5, coverage: 65 },
    { month: 'Dec 2024', debtRatio: 21.8, complexity: 8.3, coverage: 67 },
    { month: 'Jan 2025', debtRatio: 20.5, complexity: 8.0, coverage: 70 },
    { month: 'Feb 2025', debtRatio: 19.2, complexity: 7.8, coverage: 72 },
    { month: 'Mar 2025', debtRatio: 18.7, complexity: 7.8, coverage: 72 },
    { month: 'Apr 2025', debtRatio: 17.5, complexity: 7.5, coverage: 74 },
    { month: 'May 2025', debtRatio: 17.0, complexity: 7.4, coverage: 75 },
    { month: 'Jun 2025', debtRatio: 16.2, complexity: 7.2, coverage: 76 },
    { month: 'Jul 2025', debtRatio: 15.8, complexity: 7.2, coverage: 77 },
    { month: 'Aug 2025', debtRatio: 15.5, complexity: 7.3, coverage: 77 },
    { month: 'Sep 2025', debtRatio: 15.4, complexity: 7.2, coverage: 78 },
    { month: 'Oct 2025', debtRatio: 15.3, complexity: 7.2, coverage: 78 }
  ];

  // Refactoring milestones for markers
  const refactoringMilestones = [
    { month: 'Feb 2025', label: 'Auth Service Consolidation', index: 3 },
    { month: 'Jun 2025', label: 'DB Pool Upgrade', index: 7 },
    { month: 'Sep 2025', label: 'Error Handling Modernization', index: 10 }
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

  const getComplexityColor = (complexity: number) => {
    if (complexity >= 8) return 'text-red-600';
    if (complexity >= 5) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getTestCoverageColor = (coverage: number) => {
    if (coverage >= 90) return 'text-green-600';
    if (coverage >= 70) return 'text-yellow-600';
    return 'text-red-600';
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

  const filteredDuplicates = duplicateCode.filter(duplicate => {
    const matchesSearch = duplicate.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         duplicate.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedDuplicateCategory === "all" || duplicate.category === selectedDuplicateCategory;
    const matchesSimilarity = duplicate.similarity >= similarityThreshold;
    const matchesImpact = !showOnlyHighImpact || duplicate.severity === 'high' || duplicate.severity === 'critical';
    return matchesSearch && matchesCategory && matchesSimilarity && matchesImpact;
  });

  return (
    <div className="space-y-6">
      {/* Main Tab Navigation */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pattern-debt">
            <Layers className="w-4 h-4 mr-2" />
            Pattern Debt
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            <Copy className="w-4 h-4 mr-2" />
            Duplicates
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Technical Debt Overview</CardTitle>
              <CardDescription>
                Track and manage technical debt across your codebase with key metrics and trends.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                  <div className="text-2xl font-bold">
                    {metric.current}
                    {!metric.unit.startsWith('%') && !metric.unit.startsWith('/') ? ' ' : ''}
                    {metric.unit}
                  </div>
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
            </CardContent>
          </Card>

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

          {/* Timeline Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Tech Debt Timeline</CardTitle>
              <CardDescription>
                Track how technical debt has evolved over the past 12 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RechartsLineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    label={{ value: 'Debt Ratio / Complexity', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    label={{ value: 'Test Coverage (%)', angle: 90, position: 'insideRight', style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        debtRatio: 'Tech Debt Ratio',
                        complexity: 'Code Complexity',
                        coverage: 'Test Coverage'
                      };
                      return [
                        name === 'coverage' ? `${value}%` : value.toFixed(1),
                        labels[name] || name
                      ];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        debtRatio: 'Technical Debt Ratio (%)',
                        complexity: 'Code Complexity (avg)',
                        coverage: 'Test Coverage (%)'
                      };
                      return labels[value] || value;
                    }}
                  />

                  {/* Primary metric: Technical Debt Ratio */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="debtRatio"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "hsl(var(--destructive))" }}
                    activeDot={{ r: 6 }}
                  />

                  {/* Secondary metric: Code Complexity */}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="complexity"
                    stroke="hsl(var(--warning))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--warning))" }}
                    strokeDasharray="5 5"
                  />

                  {/* Tertiary metric: Test Coverage */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="coverage"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--success))" }}
                  />

                  {/* Refactoring milestone markers */}
                  {refactoringMilestones.map((milestone, index) => (
                    <ReferenceLine
                      key={index}
                      x={milestone.month}
                      yAxisId="left"
                      stroke="hsl(var(--primary))"
                      strokeDasharray="3 3"
                      strokeWidth={2}
                      label={{
                        value: milestone.label,
                        position: 'top',
                        fill: 'hsl(var(--primary))',
                        fontSize: 11,
                        fontWeight: 600
                      }}
                    />
                  ))}
                </RechartsLineChart>
              </ResponsiveContainer>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-destructive" />
                    <span className="font-semibold text-sm">Technical Debt Ratio</span>
                  </div>
                  <div className="text-2xl font-bold text-destructive">-32%</div>
                  <p className="text-xs text-muted-foreground">Decreased from 22.5% to 15.3%</p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'hsl(var(--warning))' }} />
                    <span className="font-semibold text-sm">Code Complexity</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: 'hsl(var(--warning))' }}>-15%</div>
                  <p className="text-xs text-muted-foreground">Improved from 8.5 to 7.2 avg</p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'hsl(var(--success))' }} />
                    <span className="font-semibold text-sm">Test Coverage</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: 'hsl(var(--success))' }}>+20%</div>
                  <p className="text-xs text-muted-foreground">Increased from 65% to 78%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pattern Debt Tab */}
        <TabsContent value="pattern-debt" className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedCategory === "patterns" ? "default" : "outline"}
              onClick={() => setSelectedCategory("patterns")}
            >
              <Layers className="w-4 h-4 mr-2" />
              Pattern Analysis
            </Button>
            <Button
              variant={selectedCategory === "opportunities" ? "default" : "outline"}
              onClick={() => setSelectedCategory("opportunities")}
            >
              <Target className="w-4 h-4 mr-2" />
              Refactoring Opportunities
            </Button>
          </div>

          {/* Pattern Analysis Section */}
          {selectedCategory === "patterns" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pattern Analysis</CardTitle>
                  <CardDescription>
                    Analyze code patterns across your codebase to identify usage trends and health metrics.
                  </CardDescription>
                </CardHeader>
              </Card>

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

          {/* Refactoring Opportunities Section */}
          {selectedCategory === "opportunities" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Refactoring Opportunities</CardTitle>
                      <CardDescription>
                        High-value refactoring opportunities ranked by impact, effort, and ROI.
                      </CardDescription>
                    </div>
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
                </CardHeader>
              </Card>

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
                          <SavingsTooltip className="text-sm text-muted-foreground" />
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
        </TabsContent>

        {/* Duplicates Tab - Full content from DuplicateDetection */}
        <TabsContent value="duplicates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Duplicate Code Detection</CardTitle>
              <CardDescription>
                Identify and eliminate duplicate code patterns to improve maintainability and reduce technical debt.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Label htmlFor="search">Search:</Label>
              <Input
                id="search"
                placeholder="Search duplicates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="category">Category:</Label>
              <Select value={selectedDuplicateCategory} onValueChange={setSelectedDuplicateCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="API Design">API Design</SelectItem>
                  <SelectItem value="Data Access">Data Access</SelectItem>
                  <SelectItem value="UI Components">UI Components</SelectItem>
                  <SelectItem value="Error Handling">Error Handling</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label>Similarity:</Label>
              <Slider
                value={[similarityThreshold]}
                onValueChange={(value) => setSimilarityThreshold(value[0])}
                max={100}
                min={50}
                step={5}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{similarityThreshold}%</span>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="high-impact"
                checked={showOnlyHighImpact}
                onCheckedChange={setShowOnlyHighImpact}
              />
              <Label htmlFor="high-impact">High Impact Only</Label>
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2">
            <Button
              variant={activeView === "detection" ? "default" : "outline"}
              onClick={() => setActiveView("detection")}
            >
              <Search className="w-4 h-4 mr-2" />
              Detection
            </Button>
            <Button
              variant={activeView === "patterns" ? "default" : "outline"}
              onClick={() => setActiveView("patterns")}
            >
              <Layers className="w-4 h-4 mr-2" />
              Pattern Replacements
            </Button>
            <Button
              variant={activeView === "plans" ? "default" : "outline"}
              onClick={() => setActiveView("plans")}
            >
              <Target className="w-4 h-4 mr-2" />
              Refactoring Plans
            </Button>
            <Button
              variant={activeView === "analytics" ? "default" : "outline"}
              onClick={() => setActiveView("analytics")}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </div>

          {/* Detection View */}
          {activeView === "detection" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Duplicate Code Detection</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Found <strong className="text-primary">15 duplicate clusters</strong> across {filteredDuplicates.length} instances
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {filteredDuplicates.length} duplicate patterns
                </div>
              </div>

              {filteredDuplicates.map((duplicate) => (
                <Card key={duplicate.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {duplicate.title}
                          <Badge variant={getSeverityColor(duplicate.severity)}>
                            {duplicate.severity}
                          </Badge>
                          <Badge variant="outline">
                            {duplicate.similarity}% similar
                          </Badge>
                        </CardTitle>
                        <CardDescription>{duplicate.description}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          ${duplicate.estimatedSavings.toLocaleString()}
                        </div>
                        <SavingsTooltip className="text-sm text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Occurrences</div>
                        <div className="font-semibold">{duplicate.occurrences} files</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Total Lines</div>
                        <div className="font-semibold">{duplicate.totalLines}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Complexity</div>
                        <div className={`font-semibold ${getComplexityColor(duplicate.refactoringComplexity)}`}>
                          {duplicate.refactoringComplexity}/10
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground">Time to Refactor</div>
                        <div className="font-semibold">{duplicate.timeToRefactor}</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">Affected Files:</div>
                          {duplicate.bestImplementation && (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Best Implementation Identified
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {duplicate.files.map((file, index) => {
                            const isBest = duplicate.bestImplementation === file.path;
                            return (
                              <div key={index} className={`border rounded p-2 text-sm ${isBest ? 'border-green-500 bg-green-500/10' : ''}`}>
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">{file.path}</div>
                                  {isBest && (
                                    <Badge variant="default" className="text-xs h-5">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Best
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-muted-foreground">
                                  Lines {file.startLine}-{file.endLine} • {file.lines} lines
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>Complexity: <span className={getComplexityColor(file.complexity)}>{file.complexity}/10</span></span>
                                  <span>Tests: <span className={getTestCoverageColor(file.testCoverage)}>{file.testCoverage}%</span></span>
                                  <span>Modified: {file.lastModified}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-1">Suggested Replacement:</div>
                          <code className="text-sm bg-muted px-2 py-1 rounded block">
                            {duplicate.suggestedReplacement}
                          </code>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-1">Upgrade Path:</div>
                          <div className="text-sm text-muted-foreground">
                            {duplicate.upgradePath}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">Patterns:</div>
                        <div className="flex flex-wrap gap-1">
                          {duplicate.patterns.map((pattern, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {pattern}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => setSelectedDuplicate(duplicate)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                      <Button variant="outline" size="sm">
                        <Code className="w-4 h-4 mr-2" />
                        View Code
                      </Button>
                      <Button variant="outline" size="sm">
                        <Zap className="w-4 h-4 mr-2" />
                        Auto-Refactor
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedDuplicate(duplicate);
                          setShowRefactorPlan(true);
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        View Refactor Plan
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pattern Replacements View */}
          {activeView === "patterns" && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Pattern Replacements</h2>

              {patternReplacements.map((replacement) => (
                <Card key={replacement.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{replacement.fromPattern} → {replacement.toPattern}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {replacement.compatibility}% compatible
                        </Badge>
                        <Badge variant="secondary">
                          {replacement.estimatedTime}
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Migration Steps:</div>
                          <ol className="list-decimal list-inside space-y-1 text-sm">
                            {replacement.migrationSteps.map((step, index) => (
                              <li key={index}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Benefits:</div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {replacement.benefits.map((benefit, index) => (
                              <li key={index} className="text-green-600">{benefit}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Risks:</div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {replacement.risks.map((risk, index) => (
                              <li key={index} className="text-red-600">{risk}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Test Cases:</div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {replacement.testCases.map((test, index) => (
                              <li key={index}>{test}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm">
                          <Zap className="w-4 h-4 mr-2" />
                          Start Migration
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Export Plan
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Refactoring Plans View */}
          {activeView === "plans" && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Refactoring Plans</h2>

              {refactoringPlans.map((plan) => (
                <Card key={plan.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{plan.name}</span>
                      <div className="flex gap-2">
                        <Badge variant={plan.riskLevel === 'high' ? 'destructive' : plan.riskLevel === 'medium' ? 'default' : 'secondary'}>
                          {plan.riskLevel} risk
                        </Badge>
                        <Badge variant="outline">
                          {plan.estimatedTime}
                        </Badge>
                      </div>
                    </CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <SavingsTooltip className="text-sm font-medium text-muted-foreground">Estimated Savings</SavingsTooltip>
                          <div className="text-2xl font-bold text-green-600">
                            ${plan.estimatedSavings.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Steps</div>
                          <div className="text-2xl font-bold">{plan.steps.length}</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Duplicates</div>
                          <div className="text-2xl font-bold">{plan.duplicates.length}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">Refactoring Steps:</div>
                        <div className="space-y-2">
                          {plan.steps.map((step) => (
                            <div key={step.id} className="border rounded p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{step.order}.</span>
                                  <span>{step.description}</span>
                                  {step.automated && (
                                    <Badge variant="secondary" className="text-xs">Automated</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {step.estimatedTime}
                                </div>
                              </div>
                              {step.dependencies.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Depends on: {step.dependencies.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Prerequisites:</div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {plan.prerequisites.map((prereq, index) => (
                              <li key={index}>{prereq}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Test Plan:</div>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            {plan.testPlan.map((test, index) => (
                              <li key={index}>{test}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm">
                          <Zap className="w-4 h-4 mr-2" />
                          Execute Plan
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Export Plan
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Analytics View */}
          {activeView === "analytics" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Duplicate Analysis</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Search className="w-5 h-5 mr-2" />
                      Total Duplicates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">47</div>
                    <div className="text-sm text-muted-foreground">+12 from last scan</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <DollarSign className="w-5 h-5 mr-2" />
                      <SavingsTooltip />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">$156K</div>
                    <div className="text-sm text-muted-foreground">Total estimated savings</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Refactoring Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">3.2 weeks</div>
                    <div className="text-sm text-muted-foreground">Total estimated time</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Target className="w-5 h-5 mr-2" />
                      High Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">8</div>
                    <div className="text-sm text-muted-foreground">Critical/High severity</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Duplicates by Category</CardTitle>
                    <CardDescription>Distribution of duplicate code across different categories</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-64">
                      <BarChart data={duplicatesByCategory}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="category"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          interval={0}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[8, 8, 0, 0]}
                        >
                          {duplicatesByCategory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Refactoring Progress</CardTitle>
                    <CardDescription>Trend of duplicate reduction over the past 6 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-64">
                      <RechartsLineChart data={refactoringProgressData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                        />
                        <Line
                          type="monotone"
                          dataKey="duplicates"
                          stroke="hsl(var(--chart-1))"
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="resolved"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--chart-2))", r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </RechartsLineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <TechDebtDetailModal
        opportunity={selectedOpportunity}
        isOpen={!!selectedOpportunity}
        onClose={() => setSelectedOpportunity(null)}
      />

      <DuplicateDetailModal
        duplicate={selectedDuplicate}
        isOpen={!!selectedDuplicate && !showRefactorPlan}
        onClose={() => setSelectedDuplicate(null)}
      />

      {selectedDuplicate && (
        <RefactorPlanModal
          open={showRefactorPlan}
          onClose={() => {
            setShowRefactorPlan(false);
            setSelectedDuplicate(null);
          }}
          plan={{
            name: `Refactor ${selectedDuplicate.title}`,
            description: selectedDuplicate.description,
            steps: [
              {
                id: '1',
                description: `Extract common logic from ${selectedDuplicate.files.length} files`,
                order: 1,
                estimatedTime: '2-3 hours',
                dependencies: [],
                automated: false,
                files: selectedDuplicate.files.map(f => f.path)
              },
              {
                id: '2',
                description: `Create ${selectedDuplicate.suggestedReplacement} utility`,
                order: 2,
                estimatedTime: '3-4 hours',
                dependencies: ['1'],
                automated: false,
                files: []
              },
              {
                id: '3',
                description: `Update all ${selectedDuplicate.occurrences} occurrences to use new utility`,
                order: 3,
                estimatedTime: '4-6 hours',
                dependencies: ['2'],
                automated: true,
                files: selectedDuplicate.files.map(f => f.path)
              },
              {
                id: '4',
                description: 'Run test suite and verify all functionality',
                order: 4,
                estimatedTime: '1-2 hours',
                dependencies: ['3'],
                automated: false,
                files: []
              }
            ],
            estimatedTime: selectedDuplicate.timeToRefactor,
            estimatedSavings: selectedDuplicate.estimatedSavings,
            riskLevel: selectedDuplicate.severity === 'critical' ? 'high' : selectedDuplicate.severity === 'high' ? 'medium' : 'low',
            prerequisites: [
              'All affected files committed to feature branch',
              'Test coverage > 80% for affected modules',
              'Code review approval from tech lead'
            ],
            testPlan: [
              'Unit tests for extracted utility',
              'Integration tests for all affected endpoints',
              'Performance regression tests',
              'End-to-end smoke tests'
            ]
          }}
          duplicateTitle={selectedDuplicate.title}
        />
      )}
    </div>
  );
};

export default TechDebtAnalysis;

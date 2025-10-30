import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DuplicateDetailModal } from "@/components/DuplicateDetailModal";
import { 
  Search, 
  Filter, 
  RefreshCw,
  Download,
  Eye,
  Code,
  Copy,
  Zap,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  Target,
  Layers,
  FileText,
  GitBranch,
  Settings,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Database,
  Cpu,
  HardDrive,
  Network,
  Shield,
  Lightbulb
} from "lucide-react";

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

const DuplicateDetection: React.FC = () => {
  const [activeView, setActiveView] = useState("detection");
  const [searchTerm, setSearchTerm] = useState("");
  const [similarityThreshold, setSimilarityThreshold] = useState(80);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showOnlyHighImpact, setShowOnlyHighImpact] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateCode | null>(null);

  // Mock data for duplicate code
  const duplicateCode: DuplicateCode[] = [
    {
      id: "1",
      title: "API Response Wrapper",
      description: "Standard response formatting logic repeated across multiple API endpoints",
      similarity: 95,
      occurrences: 12,
      totalLines: 180,
      files: [
        { path: "src/api/users.ts", lines: 15, startLine: 45, endLine: 60, lastModified: "2024-01-15", author: "John Doe", complexity: 3, testCoverage: 85 },
        { path: "src/api/products.ts", lines: 15, startLine: 32, endLine: 47, lastModified: "2024-01-14", author: "Jane Smith", complexity: 3, testCoverage: 90 },
        { path: "src/api/orders.ts", lines: 15, startLine: 28, endLine: 43, lastModified: "2024-01-13", author: "Bob Johnson", complexity: 3, testCoverage: 78 },
        { path: "src/api/payments.ts", lines: 15, startLine: 51, endLine: 66, lastModified: "2024-01-12", author: "Alice Brown", complexity: 3, testCoverage: 92 }
      ],
      category: "API Design",
      severity: 'high',
      refactoringComplexity: 4,
      estimatedSavings: 25000,
      timeToRefactor: "2-3 days",
      patterns: ["Response Builder", "Error Handling"],
      suggestedReplacement: "StandardResponse<T> utility class",
      upgradePath: "Extract to shared utility and update all endpoints"
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
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

  const filteredDuplicates = duplicateCode.filter(duplicate => {
    const matchesSearch = duplicate.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         duplicate.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || duplicate.category === selectedCategory;
    const matchesSimilarity = duplicate.similarity >= similarityThreshold;
    const matchesImpact = !showOnlyHighImpact || duplicate.severity === 'high' || duplicate.severity === 'critical';
    return matchesSearch && matchesCategory && matchesSimilarity && matchesImpact;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Duplicate Detection & Pattern Replacement</h1>
          <p className="ty-subtitle">
            Identify duplicate code and upgrade to better patterns from your library
          </p>
        </div>
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
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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
            <h2 className="text-2xl font-bold">Duplicate Code Detection</h2>
            <div className="text-sm text-muted-foreground">
              Found {filteredDuplicates.length} duplicate patterns
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
                    <div className="text-sm text-muted-foreground">Potential Savings</div>
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
                    <div className="text-sm font-medium mb-2">Affected Files:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {duplicate.files.map((file, index) => (
                        <div key={index} className="border rounded p-2 text-sm">
                          <div className="font-medium">{file.path}</div>
                          <div className="text-muted-foreground">
                            Lines {file.startLine}-{file.endLine} • {file.lines} lines
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Complexity: <span className={getComplexityColor(file.complexity)}>{file.complexity}/10</span></span>
                            <span>Tests: <span className={getTestCoverageColor(file.testCoverage)}>{file.testCoverage}%</span></span>
                            <span>Modified: {file.lastModified}</span>
                          </div>
                        </div>
                      ))}
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
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Generate Plan
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
                      <div className="text-sm font-medium text-muted-foreground">Estimated Savings</div>
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
                  Potential Savings
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
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                  <div className="text-center">
                    <PieChart className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">Category distribution chart</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Refactoring Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                  <div className="text-center">
                    <LineChart className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">Progress over time chart</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <DuplicateDetailModal
        duplicate={selectedDuplicate}
        isOpen={!!selectedDuplicate}
        onClose={() => setSelectedDuplicate(null)}
      />
    </div>
  );
};

export default DuplicateDetection;

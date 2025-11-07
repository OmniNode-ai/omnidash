import React from "react";
import { DetailModal } from "./DetailModal";
import { SavingsTooltip } from "@/components/SavingsTooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Code, 
  Zap, 
  Download, 
  Eye, 
  FileText, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Layers,
  DollarSign,
  BarChart3,
  Activity
} from "lucide-react";

import type { RefactoringOpportunity } from "@/pages/preview/TechDebtAnalysis";

interface _RefactoringOpportunity {
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

interface TechDebtDetailModalProps {
  opportunity: RefactoringOpportunity | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TechDebtDetailModal({ opportunity, isOpen, onClose }: TechDebtDetailModalProps) {
  if (!opportunity) return null;

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "low": return "text-green-500";
      case "medium": return "text-yellow-500";
      case "high": return "text-red-500";
      case "critical": return "text-red-600";
      default: return "text-gray-500";
    }
  };

  const getImpactBadgeVariant = (impact: string) => {
    switch (impact) {
      case "low": return "default";
      case "medium": return "secondary";
      case "high": return "destructive";
      case "critical": return "destructive";
      default: return "outline";
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case "low": return "text-green-500";
      case "medium": return "text-yellow-500";
      case "high": return "text-orange-500";
      case "extreme": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={opportunity.title}
      subtitle={`${opportunity.category} • ${opportunity.files.length} files`}
    >
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Impact Level</div>
              <Badge variant={getImpactBadgeVariant(opportunity.impact)} className="mt-1">
                {opportunity.impact.toUpperCase()}
              </Badge>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Effort Required</div>
              <Badge variant="outline" className="mt-1">
                {opportunity.effort.toUpperCase()}
              </Badge>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Time Estimate</div>
              <div className="text-2xl font-bold font-mono">{opportunity.timeEstimate}</div>
            </Card>
            <Card className="p-4">
              <SavingsTooltip className="text-xs text-muted-foreground mb-1">Cost Savings</SavingsTooltip>
              <div className="text-2xl font-bold font-mono">${opportunity.costSavings.toLocaleString()}</div>
            </Card>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Description</h4>
            <p className="text-sm text-muted-foreground">{opportunity.description}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Affected Files</h4>
            <div className="space-y-1">
              {opportunity.files.map((file, index) => (
                <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                  {file}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Patterns Detected</h4>
            <div className="flex flex-wrap gap-1">
              {opportunity.patterns.map((pattern, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {pattern}
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Technical Debt Score</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Debt Level</span>
                  <span className="font-mono">{opportunity.technicalDebt}/100</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, opportunity.technicalDebt || 0))} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Complexity</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Complexity</span>
                  <span className="font-mono">{opportunity.complexity}/10</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, (opportunity.complexity || 0) * 10))} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Test Coverage</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Coverage</span>
                  <span className="font-mono">{opportunity.testCoverage}%</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, opportunity.testCoverage || 0))} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Quality Metrics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Maintainability</div>
                  <div className="text-lg font-bold">{opportunity.maintainability}/100</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Performance</div>
                  <div className="text-lg font-bold">{opportunity.performance}/100</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Security</div>
                  <div className="text-lg font-bold">{opportunity.security}/100</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Priority</div>
                  <div className="text-lg font-bold">{opportunity.priority}/10</div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plan" className="space-y-4 mt-4">
          <div>
            <h4 className="text-sm font-semibold mb-3">Suggested Approach</h4>
            <p className="text-sm text-muted-foreground mb-4">{opportunity.suggestedApproach}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Benefits</h4>
            <div className="space-y-2">
              {opportunity.benefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Risks</h4>
            <div className="space-y-2">
              {opportunity.risks.map((risk, index) => (
                <div key={index} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{risk}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Dependencies</h4>
            <div className="space-y-1">
              {opportunity.dependencies.map((dep, index) => (
                <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                  {dep}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="impact" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Cost Impact</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <SavingsTooltip>Estimated Savings</SavingsTooltip>
                  <span className="font-mono">${opportunity.costSavings.toLocaleString()}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, (opportunity.costSavings || 0) / 50000 * 100))} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Time Impact</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Refactoring Time</span>
                  <span className="font-mono">{opportunity.timeEstimate}</span>
                </div>
                <Progress value={Math.max(0, Math.min(100, opportunity.effort === 'low' ? 25 : opportunity.effort === 'medium' ? 50 : opportunity.effort === 'high' ? 75 : 100))} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Quality Impact</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Maintainability</div>
                  <div className="text-lg font-bold text-green-500">+{opportunity.maintainability}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Performance</div>
                  <div className="text-lg font-bold text-green-500">+{opportunity.performance}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Security</div>
                  <div className="text-lg font-bold text-green-500">+{opportunity.security}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Debt Reduction</div>
                  <div className="text-lg font-bold text-green-500">-{opportunity.technicalDebt}</div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" size="sm">
          <Code className="w-4 h-4 mr-2" />
          View Code
        </Button>
        <Button variant="outline" size="sm">
          <Zap className="w-4 h-4 mr-2" />
          Start Refactoring
        </Button>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Generate Plan
        </Button>
      </div>
    </DetailModal>
  );
}

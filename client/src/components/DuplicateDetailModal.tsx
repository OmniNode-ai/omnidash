import React from "react";
import { DetailModal } from "./DetailModal";
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
  Layers
} from "lucide-react";

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

interface DuplicateDetailModalProps {
  duplicate: DuplicateCode | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DuplicateDetailModal({ duplicate, isOpen, onClose }: DuplicateDetailModalProps) {
  if (!duplicate) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low": return "text-green-500";
      case "medium": return "text-yellow-500";
      case "high": return "text-red-500";
      case "critical": return "text-red-600";
      default: return "text-gray-500";
    }
  };

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "low": return "default";
      case "medium": return "secondary";
      case "high": return "destructive";
      case "critical": return "destructive";
      default: return "outline";
    }
  };

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={duplicate.title}
      subtitle={`${duplicate.category} • ${duplicate.files.length} files`}
    >
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Files Affected</div>
              <div className="text-2xl font-bold font-mono">{duplicate.files.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Lines</div>
              <div className="text-2xl font-bold font-mono">{duplicate.totalLines.toLocaleString()}</div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Similarity</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{duplicate.similarity}%</span>
                  <span className="text-muted-foreground">High</span>
                </div>
                <Progress value={duplicate.similarity} className="h-2" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Severity</div>
              <Badge variant={getSeverityBadgeVariant(duplicate.severity)} className="mt-1">
                {duplicate.severity.toUpperCase()}
              </Badge>
            </Card>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Description</h4>
            <p className="text-sm text-muted-foreground">{duplicate.description}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Affected Files</h4>
            <div className="space-y-1">
              {duplicate.files.map((file, index) => (
                <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                  {file.path} (lines {file.startLine}-{file.endLine})
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Patterns Detected</h4>
            <div className="flex flex-wrap gap-1">
              {duplicate.patterns.map((pattern, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {pattern}
                </Badge>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="code" className="space-y-4 mt-4">
          <div>
            <h4 className="text-sm font-semibold mb-3">Suggested Replacement</h4>
            <div className="bg-muted p-4 rounded-lg">
              <pre className="text-xs font-mono overflow-x-auto">
                {duplicate.suggestedReplacement}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Refactoring Details</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Estimated Time</span>
                <span className="font-mono">{duplicate.timeToRefactor}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Complexity</span>
                <span className="font-mono">{duplicate.refactoringComplexity}/10</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Estimated Savings</span>
                <span className="font-mono">${duplicate.estimatedSavings.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Upgrade Path</h4>
            <p className="text-sm text-muted-foreground">{duplicate.upgradePath}</p>
          </div>
        </TabsContent>

        <TabsContent value="impact" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Refactoring Complexity</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Complexity</span>
                  <span className="font-mono">{duplicate.refactoringComplexity}/10</span>
                </div>
                <Progress value={duplicate.refactoringComplexity * 10} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Estimated Savings</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Cost Savings</span>
                  <span className="font-mono">${duplicate.estimatedSavings.toLocaleString()}</span>
                </div>
                <Progress value={Math.min(duplicate.estimatedSavings / 10000 * 100, 100)} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Occurrences</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Duplicate Count</span>
                  <span className="font-mono">{duplicate.occurrences}</span>
                </div>
                <Progress value={Math.min(duplicate.occurrences * 10, 100)} className="h-2" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4 mt-4">
          <div className="space-y-3">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-primary">1</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm">Extract common functionality into a shared utility function or class</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-primary">2</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm">Consider using design patterns like Factory or Strategy to reduce duplication</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-primary">3</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm">Implement proper inheritance hierarchy to share common behavior</p>
                </div>
              </div>
            </Card>
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
          Auto-Refactor
        </Button>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Generate Plan
        </Button>
      </div>
    </DetailModal>
  );
}

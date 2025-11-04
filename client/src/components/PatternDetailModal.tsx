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
  Layers,
  Network,
  GitBranch,
  Users,
  Activity,
  ArrowRight,
  ArrowDown
} from "lucide-react";

interface PatternNode {
  id: string;
  name: string;
  type: 'pattern' | 'implementation' | 'dependency' | 'version';
  version: string;
  status: 'active' | 'deprecated' | 'experimental' | 'stable';
  usage: number;
  performance: number;
  complexity: number;
  lastUpdated: string;
  author: string;
  dependencies: string[];
  dependents: string[];
  files: string[];
  description: string;
  category: string;
  tags: string[];
  metrics: {
    linesOfCode: number;
    testCoverage: number;
    maintainability: number;
    reliability: number;
    security: number;
  };
  evolution: {
    createdAt: string;
    lastModified: string;
    versionHistory: string[];
    breakingChanges: number;
    featureAdditions: number;
  };
  relationships: {
    parent?: string;
    children: string[];
    siblings: string[];
    conflicts: string[];
  };
}

interface PatternDetailModalProps {
  pattern: PatternNode | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PatternDetailModal({ pattern, isOpen, onClose }: PatternDetailModalProps) {
  if (!pattern) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-green-500";
      case "stable": return "text-blue-500";
      case "experimental": return "text-yellow-500";
      case "deprecated": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "stable": return "secondary";
      case "experimental": return "outline";
      case "deprecated": return "destructive";
      default: return "outline";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "pattern": return <Layers className="w-4 h-4" />;
      case "implementation": return <Code className="w-4 h-4" />;
      case "dependency": return <GitBranch className="w-4 h-4" />;
      case "version": return <Clock className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={pattern.name}
      subtitle={`${pattern.type} • v${pattern.version}`}
    >
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="evolution">Evolution</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Badge variant={getStatusBadgeVariant(pattern.status)} className="mt-1">
                {pattern.status.toUpperCase()}
              </Badge>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Type</div>
              <div className="flex items-center gap-2 mt-1">
                {getTypeIcon(pattern.type)}
                <span className="text-sm font-medium">{pattern.type}</span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Usage Count</div>
              <div className="text-2xl font-bold font-mono">{pattern.usage}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Performance</div>
              <div className="text-2xl font-bold font-mono">{pattern.performance}%</div>
            </Card>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Description</h4>
            <p className="text-sm text-muted-foreground">{pattern.description}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Files</h4>
            <div className="space-y-1">
              {pattern.files.map((file, index) => (
                <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                  {file}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Tags</h4>
            <div className="flex flex-wrap gap-1">
              {pattern.tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Author</h4>
              <p className="text-sm text-muted-foreground">{pattern.author}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Last Updated</h4>
              <p className="text-sm text-muted-foreground">{pattern.lastUpdated}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Code Metrics</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Lines of Code</span>
                  <span className="font-mono">{pattern.metrics.linesOfCode.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Complexity</span>
                  <span className="font-mono">{pattern.complexity}/10</span>
                </div>
                <Progress value={pattern.complexity * 10} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Quality Metrics</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Test Coverage</span>
                  <span className="font-mono">{pattern.metrics.testCoverage}%</span>
                </div>
                <Progress value={pattern.metrics.testCoverage} className="h-2" />
                
                <div className="flex justify-between text-sm">
                  <span>Maintainability</span>
                  <span className="font-mono">{pattern.metrics.maintainability}/100</span>
                </div>
                <Progress value={pattern.metrics.maintainability} className="h-2" />
                
                <div className="flex justify-between text-sm">
                  <span>Reliability</span>
                  <span className="font-mono">{pattern.metrics.reliability}/100</span>
                </div>
                <Progress value={pattern.metrics.reliability} className="h-2" />
                
                <div className="flex justify-between text-sm">
                  <span>Security</span>
                  <span className="font-mono">{pattern.metrics.security}/100</span>
                </div>
                <Progress value={pattern.metrics.security} className="h-2" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Performance</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Performance Score</span>
                  <span className="font-mono">{pattern.performance}%</span>
                </div>
                <Progress value={pattern.performance} className="h-2" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evolution" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Timeline</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Created</span>
                  <span className="font-mono">{pattern.evolution.createdAt}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Last Modified</span>
                  <span className="font-mono">{pattern.evolution.lastModified}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Version History</h4>
              <div className="space-y-1">
                {pattern.evolution.versionHistory.map((version, index) => (
                  <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                    v{version}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Breaking Changes</div>
                <div className="text-2xl font-bold text-red-500">{pattern.evolution.breakingChanges}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Feature Additions</div>
                <div className="text-2xl font-bold text-green-500">{pattern.evolution.featureAdditions}</div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="relationships" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-3">Dependencies</h4>
              <div className="space-y-1">
                {pattern.dependencies.map((dep, index) => (
                  <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                    {dep}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Dependents</h4>
              <div className="space-y-1">
                {pattern.dependents.map((dep, index) => (
                  <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                    {dep}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Hierarchy</h4>
              <div className="space-y-2">
                {pattern.relationships.parent && (
                  <div className="flex items-center gap-2">
                    <ArrowDown className="w-4 h-4" />
                    <span className="text-sm">Parent: {pattern.relationships.parent}</span>
                  </div>
                )}
                {pattern.relationships.children.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-1">Children:</div>
                    {pattern.relationships.children.map((child, index) => (
                      <div key={index} className="flex items-center gap-2 ml-4">
                        <ArrowRight className="w-4 h-4" />
                        <span className="text-sm">{child}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pattern.relationships.siblings.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-1">Siblings:</div>
                    {pattern.relationships.siblings.map((sibling, index) => (
                      <div key={index} className="text-sm ml-4">• {sibling}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pattern.relationships.conflicts.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3">Conflicts</h4>
                <div className="space-y-1">
                  {pattern.relationships.conflicts.map((conflict, index) => (
                    <div key={index} className="text-sm font-mono bg-red-100 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-300">
                      {conflict}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          <Network className="w-4 h-4 mr-2" />
          View Graph
        </Button>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>
    </DetailModal>
  );
}

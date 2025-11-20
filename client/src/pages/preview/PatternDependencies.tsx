import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PatternDetailModal } from '@/components/PatternDetailModal';
import { UnifiedGraph, type GraphNode, type GraphEdge } from '@/components/UnifiedGraph';
import {
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Code,
  Layers,
  GitBranch,
  Circle,
  Square,
  Diamond,
} from 'lucide-react';

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

interface PatternConnection {
  from: string;
  to: string;
  type: 'dependency' | 'inheritance' | 'composition' | 'usage';
  strength: number;
  bidirectional: boolean;
}

const PatternDependencies: React.FC = () => {
  const [activeView, setActiveView] = useState('graph');
  const [selectedPattern, setSelectedPattern] = useState<PatternNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [zoomLevel, setZoomLevel] = useState(100);

  // Mock data for pattern nodes
  const patternNodes: PatternNode[] = [
    {
      id: 'auth-pattern',
      name: 'Authentication Pattern',
      type: 'pattern',
      version: '2.1.0',
      status: 'stable',
      usage: 15,
      performance: 95,
      complexity: 6,
      lastUpdated: '2024-01-15',
      author: 'Team Alpha',
      dependencies: ['error-handling', 'session-management'],
      dependents: ['user-service', 'admin-service', 'api-gateway'],
      files: ['auth-pattern.ts', 'auth-middleware.ts', 'auth-guard.ts'],
      description: 'Centralized authentication logic with JWT token management',
      category: 'Security',
      tags: ['authentication', 'security', 'jwt', 'oauth2'],
      metrics: {
        linesOfCode: 850,
        testCoverage: 92,
        maintainability: 85,
        reliability: 95,
        security: 98,
      },
      evolution: {
        createdAt: '2023-06-01',
        lastModified: '2024-01-15',
        versionHistory: ['1.0.0', '1.5.0', '2.0.0', '2.1.0'],
        breakingChanges: 2,
        featureAdditions: 8,
      },
      relationships: {
        children: ['user-service', 'admin-service'],
        siblings: ['authorization-pattern'],
        conflicts: [],
      },
    },
    {
      id: 'error-handling',
      name: 'Error Handling',
      type: 'pattern',
      version: '1.8.2',
      status: 'stable',
      usage: 23,
      performance: 88,
      complexity: 4,
      lastUpdated: '2024-01-10',
      author: 'Team Beta',
      dependencies: ['logging-pattern'],
      dependents: ['auth-pattern', 'api-pattern', 'data-validation'],
      files: ['error-handler.ts', 'exception-manager.ts', 'error-types.ts'],
      description: 'Standardized error handling and exception management',
      category: 'Error Management',
      tags: ['error-handling', 'exceptions', 'logging'],
      metrics: {
        linesOfCode: 520,
        testCoverage: 88,
        maintainability: 82,
        reliability: 90,
        security: 85,
      },
      evolution: {
        createdAt: '2023-04-15',
        lastModified: '2024-01-10',
        versionHistory: ['1.0.0', '1.5.0', '1.8.0', '1.8.2'],
        breakingChanges: 0,
        featureAdditions: 5,
      },
      relationships: {
        children: ['api-pattern', 'data-validation'],
        siblings: ['logging-pattern'],
        conflicts: [],
      },
    },
    {
      id: 'data-validation',
      name: 'Data Validation',
      type: 'pattern',
      version: '3.0.1',
      status: 'stable',
      usage: 31,
      performance: 92,
      complexity: 7,
      lastUpdated: '2024-01-20',
      author: 'Team Gamma',
      dependencies: ['error-handling', 'type-definitions'],
      dependents: ['form-handler', 'api-pattern', 'data-transformer'],
      files: ['validator.ts', 'schema-builder.ts', 'validation-rules.ts'],
      description: 'Comprehensive data validation with schema-based rules',
      category: 'Data Management',
      tags: ['validation', 'schema', 'data-quality'],
      metrics: {
        linesOfCode: 720,
        testCoverage: 90,
        maintainability: 88,
        reliability: 92,
        security: 87,
      },
      evolution: {
        createdAt: '2023-03-10',
        lastModified: '2024-01-20',
        versionHistory: ['1.0.0', '2.0.0', '3.0.0', '3.0.1'],
        breakingChanges: 2,
        featureAdditions: 12,
      },
      relationships: {
        children: ['form-handler', 'api-pattern'],
        siblings: ['type-definitions'],
        conflicts: [],
      },
    },
    {
      id: 'api-pattern',
      name: 'API Response Pattern',
      type: 'pattern',
      version: '2.3.0',
      status: 'stable',
      usage: 18,
      performance: 90,
      complexity: 5,
      lastUpdated: '2024-01-18',
      author: 'Team Delta',
      dependencies: ['error-handling', 'data-validation'],
      dependents: ['user-service', 'product-service', 'order-service'],
      files: ['api-response.ts', 'response-builder.ts', 'status-codes.ts'],
      description: 'Standardized API response format and status handling',
      category: 'API Design',
      tags: ['api', 'rest', 'http', 'response'],
      metrics: {
        linesOfCode: 450,
        testCoverage: 85,
        maintainability: 80,
        reliability: 88,
        security: 82,
      },
      evolution: {
        createdAt: '2023-05-20',
        lastModified: '2024-01-18',
        versionHistory: ['1.0.0', '2.0.0', '2.3.0'],
        breakingChanges: 1,
        featureAdditions: 7,
      },
      relationships: {
        children: ['user-service', 'product-service'],
        siblings: ['error-handling'],
        conflicts: [],
      },
    },
    {
      id: 'session-management',
      name: 'Session Management',
      type: 'pattern',
      version: '1.5.0',
      status: 'stable',
      usage: 12,
      performance: 85,
      complexity: 8,
      lastUpdated: '2024-01-12',
      author: 'Team Alpha',
      dependencies: ['data-validation', 'caching-pattern'],
      dependents: ['auth-pattern', 'user-service'],
      files: ['session-manager.ts', 'session-store.ts', 'session-middleware.ts'],
      description: 'Secure session management with Redis backend',
      category: 'Security',
      tags: ['session', 'redis', 'security', 'state'],
      metrics: {
        linesOfCode: 680,
        testCoverage: 80,
        maintainability: 75,
        reliability: 85,
        security: 95,
      },
      evolution: {
        createdAt: '2023-07-15',
        lastModified: '2024-01-12',
        versionHistory: ['1.0.0', '1.2.0', '1.5.0'],
        breakingChanges: 0,
        featureAdditions: 4,
      },
      relationships: { children: ['auth-pattern'], siblings: ['caching-pattern'], conflicts: [] },
    },
    {
      id: 'caching-pattern',
      name: 'Caching Pattern',
      type: 'pattern',
      version: '2.0.0',
      status: 'stable',
      usage: 20,
      performance: 98,
      complexity: 6,
      lastUpdated: '2024-01-14',
      author: 'Team Epsilon',
      dependencies: [],
      dependents: ['session-management', 'data-fetcher', 'api-pattern'],
      files: ['cache-manager.ts', 'cache-strategies.ts', 'cache-invalidator.ts'],
      description: 'Multi-layer caching with intelligent invalidation',
      category: 'Performance',
      tags: ['cache', 'performance', 'optimization', 'redis'],
      metrics: {
        linesOfCode: 590,
        testCoverage: 95,
        maintainability: 90,
        reliability: 98,
        security: 88,
      },
      evolution: {
        createdAt: '2023-02-05',
        lastModified: '2024-01-14',
        versionHistory: ['1.0.0', '1.5.0', '2.0.0'],
        breakingChanges: 1,
        featureAdditions: 6,
      },
      relationships: {
        children: ['session-management', 'data-fetcher'],
        siblings: [],
        conflicts: [],
      },
    },
    {
      id: 'logging-pattern',
      name: 'Logging Pattern',
      type: 'pattern',
      version: '1.3.0',
      status: 'stable',
      usage: 28,
      performance: 82,
      complexity: 3,
      lastUpdated: '2024-01-08',
      author: 'Team Beta',
      dependencies: [],
      dependents: ['error-handling', 'api-pattern'],
      files: ['logger.ts', 'log-formatter.ts', 'log-levels.ts'],
      description: 'Structured logging with context propagation',
      category: 'Observability',
      tags: ['logging', 'observability', 'monitoring'],
      metrics: {
        linesOfCode: 320,
        testCoverage: 78,
        maintainability: 85,
        reliability: 80,
        security: 75,
      },
      evolution: {
        createdAt: '2023-01-10',
        lastModified: '2024-01-08',
        versionHistory: ['1.0.0', '1.1.0', '1.3.0'],
        breakingChanges: 0,
        featureAdditions: 3,
      },
      relationships: { children: ['error-handling'], siblings: [], conflicts: [] },
    },
    {
      id: 'type-definitions',
      name: 'Type Definitions',
      type: 'dependency',
      version: '4.2.0',
      status: 'stable',
      usage: 45,
      performance: 100,
      complexity: 2,
      lastUpdated: '2024-01-05',
      author: 'Team Gamma',
      dependencies: [],
      dependents: ['data-validation', 'api-pattern'],
      files: ['types.ts', 'interfaces.ts'],
      description: 'Shared TypeScript type definitions',
      category: 'Type Safety',
      tags: ['typescript', 'types', 'interfaces'],
      metrics: {
        linesOfCode: 1200,
        testCoverage: 100,
        maintainability: 95,
        reliability: 100,
        security: 90,
      },
      evolution: {
        createdAt: '2022-12-01',
        lastModified: '2024-01-05',
        versionHistory: ['1.0.0', '2.0.0', '3.0.0', '4.0.0', '4.2.0'],
        breakingChanges: 3,
        featureAdditions: 15,
      },
      relationships: { children: ['data-validation', 'api-pattern'], siblings: [], conflicts: [] },
    },
    {
      id: 'data-fetcher',
      name: 'Data Fetcher',
      type: 'implementation',
      version: '1.0.0',
      status: 'stable',
      usage: 14,
      performance: 89,
      complexity: 5,
      lastUpdated: '2024-01-11',
      author: 'Team Epsilon',
      dependencies: ['caching-pattern'],
      dependents: [],
      files: ['data-fetcher.ts', 'fetch-strategies.ts'],
      description: 'Optimized data fetching with caching layer',
      category: 'Data Management',
      tags: ['fetch', 'data', 'http', 'async'],
      metrics: {
        linesOfCode: 380,
        testCoverage: 82,
        maintainability: 80,
        reliability: 85,
        security: 78,
      },
      evolution: {
        createdAt: '2024-01-01',
        lastModified: '2024-01-11',
        versionHistory: ['1.0.0'],
        breakingChanges: 0,
        featureAdditions: 0,
      },
      relationships: { children: [], siblings: ['caching-pattern'], conflicts: [] },
    },
  ];

  // Mock data for pattern connections - ensuring 2-3 hop dependencies are visible
  const patternConnections: PatternConnection[] = [
    // Direct dependencies (hop 1)
    {
      from: 'auth-pattern',
      to: 'error-handling',
      type: 'dependency',
      strength: 0.8,
      bidirectional: false,
    },
    {
      from: 'auth-pattern',
      to: 'session-management',
      type: 'dependency',
      strength: 0.9,
      bidirectional: false,
    },
    {
      from: 'data-validation',
      to: 'error-handling',
      type: 'dependency',
      strength: 0.6,
      bidirectional: false,
    },
    {
      from: 'data-validation',
      to: 'type-definitions',
      type: 'dependency',
      strength: 0.7,
      bidirectional: false,
    },
    {
      from: 'api-pattern',
      to: 'error-handling',
      type: 'dependency',
      strength: 0.8,
      bidirectional: false,
    },
    {
      from: 'api-pattern',
      to: 'data-validation',
      type: 'dependency',
      strength: 0.7,
      bidirectional: false,
    },
    {
      from: 'session-management',
      to: 'data-validation',
      type: 'dependency',
      strength: 0.5,
      bidirectional: false,
    },
    {
      from: 'session-management',
      to: 'caching-pattern',
      type: 'dependency',
      strength: 0.8,
      bidirectional: false,
    },

    // Second hop dependencies (hop 2)
    {
      from: 'error-handling',
      to: 'logging-pattern',
      type: 'dependency',
      strength: 0.7,
      bidirectional: false,
    },
    {
      from: 'api-pattern',
      to: 'logging-pattern',
      type: 'usage',
      strength: 0.6,
      bidirectional: false,
    },

    // Third hop dependencies (hop 3)
    {
      from: 'caching-pattern',
      to: 'data-fetcher',
      type: 'usage',
      strength: 0.6,
      bidirectional: true,
    },
    {
      from: 'caching-pattern',
      to: 'api-pattern',
      type: 'usage',
      strength: 0.5,
      bidirectional: true,
    },

    // Additional connections for clear dependency visualization
    {
      from: 'type-definitions',
      to: 'api-pattern',
      type: 'usage',
      strength: 0.4,
      bidirectional: false,
    },
  ];

  const _getNodeIcon = (type: string) => {
    switch (type) {
      case 'pattern':
        return <Layers className="w-4 h-4" />;
      case 'implementation':
        return <Code className="w-4 h-4" />;
      case 'dependency':
        return <GitBranch className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getNodeShape = (type: string) => {
    switch (type) {
      case 'pattern':
        return <Square className="w-6 h-6" />;
      case 'implementation':
        return <Circle className="w-6 h-6" />;
      case 'dependency':
        return <Diamond className="w-6 h-6" />;
      default:
        return <Circle className="w-6 h-6" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable':
        return 'default';
      case 'experimental':
        return 'secondary';
      case 'deprecated':
        return 'destructive';
      case 'active':
        return 'default';
      default:
        return 'outline';
    }
  };

  const getPerformanceColor = (performance: number) => {
    if (performance >= 90) return 'text-green-600';
    if (performance >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredNodes = patternNodes.filter((node) => {
    const matchesSearch =
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || node.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Memoize layout config to prevent infinite re-renders
  const hierarchyLayout = useMemo(() => ({ type: 'hierarchy' as const }), []);

  // Memoize color scheme to prevent infinite re-renders
  const graphColorScheme = useMemo(
    () => ({
      dependency: '#3b82f6',
      inheritance: '#10b981',
      composition: '#8b5cf6',
      usage: '#f59e0b',
    }),
    []
  );

  // Convert pattern nodes to UnifiedGraph format
  const graphNodes: GraphNode[] = filteredNodes.map((node) => ({
    id: node.id,
    label: node.name,
    type: node.type,
    color:
      node.status === 'stable' ? '#10b981' : node.status === 'experimental' ? '#f59e0b' : '#6b7280',
    // Increased size range: 50-80px for better readability and text accommodation
    // Use sqrt for less extreme variations based on usage
    size: Math.min(80, Math.max(50, 50 + Math.sqrt(node.usage) * 4)),
    metadata: {
      version: node.version,
      status: node.status,
      performance: node.performance,
      complexity: node.complexity,
      usage: node.usage,
      description: node.description,
      category: node.category,
    },
  }));

  // Convert pattern connections to UnifiedGraph format with labels
  const graphEdges: GraphEdge[] = patternConnections
    .filter(
      (conn) =>
        filteredNodes.some((n) => n.id === conn.from) && filteredNodes.some((n) => n.id === conn.to)
    )
    .map((conn) => {
      // Generate human-readable labels based on connection type
      let label = '';
      switch (conn.type) {
        case 'dependency':
          label = 'depends on';
          break;
        case 'inheritance':
          label = 'extends';
          break;
        case 'composition':
          label = 'contains';
          break;
        case 'usage':
          label = 'uses';
          break;
        default:
          label = conn.type;
      }

      return {
        source: conn.from,
        target: conn.to,
        weight: conn.strength,
        type: conn.type,
        label: label,
        bidirectional: conn.bidirectional,
      };
    });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label htmlFor="search">Search:</Label>
          <Input
            id="search"
            placeholder="_Search patterns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="category">Category:</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
              <SelectItem value="Error Management">Error Management</SelectItem>
              <SelectItem value="Data Management">Data Management</SelectItem>
              <SelectItem value="API Design">API Design</SelectItem>
              <SelectItem value="Performance">Performance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label>Zoom:</Label>
          <Slider
            value={[zoomLevel]}
            onValueChange={(value) => setZoomLevel(value[0])}
            max={200}
            min={25}
            step={25}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">{zoomLevel}%</span>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={activeView === 'graph' ? 'default' : 'outline'}
          onClick={() => setActiveView('graph')}
        >
          <Network className="w-4 h-4 mr-2" />
          Graph View
        </Button>
        <Button
          variant={activeView === 'list' ? 'default' : 'outline'}
          onClick={() => setActiveView('list')}
        >
          <Layers className="w-4 h-4 mr-2" />
          List View
        </Button>
      </div>

      {/* Graph View */}
      {activeView === 'graph' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Pattern Dependency Graph</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
                >
                  <ZoomIn className="w-4 h-4 mr-2" />
                  Zoom In
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
                >
                  <ZoomOut className="w-4 h-4 mr-2" />
                  Zoom Out
                </Button>
                <Button variant="outline" size="sm" onClick={() => setZoomLevel(100)}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Interactive visualization of which patterns depend on other patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnifiedGraph
              nodes={graphNodes}
              edges={graphEdges}
              layout={hierarchyLayout}
              height="calc(100vh - 24rem)"
              interactive={true}
              zoomable={true}
              onNodeClick={(node) => {
                const patternNode = patternNodes.find((n) => n.id === node.id);
                if (patternNode) setSelectedPattern(patternNode);
              }}
              showLegend={true}
              colorScheme={graphColorScheme}
            />
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {activeView === 'list' && (
        <div className="space-y-4">
          {filteredNodes.map((node) => (
            <Card key={node.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getNodeShape(node.type)}
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {node.name}
                        <Badge variant={getStatusColor(node.status)}>{node.status}</Badge>
                        <Badge variant="outline">v{node.version}</Badge>
                      </CardTitle>
                      <CardDescription>{node.description}</CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-lg font-semibold ${getPerformanceColor(node.performance)}`}
                    >
                      {node.performance}%
                    </div>
                    <div className="text-sm text-muted-foreground">Performance</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Usage</div>
                    <div className="font-semibold">{node.usage} files</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Complexity</div>
                    <div className="font-semibold">{node.complexity}/10</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
                    <div className="font-semibold">{node.lastUpdated}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Author</div>
                    <div className="font-semibold">{node.author}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Dependencies:</div>
                  <div className="flex flex-wrap gap-1">
                    {node.dependencies.length > 0 ? (
                      node.dependencies.map((dep, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {dep}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No dependencies</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="text-sm font-medium">Used by:</div>
                  <div className="flex flex-wrap gap-1">
                    {node.dependents.length > 0 ? (
                      node.dependents.map((dep, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {dep}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not used by any patterns
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={() => setSelectedPattern(node)}>
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                  <Button variant="outline" size="sm">
                    <Code className="w-4 h-4 mr-2" />
                    View Code
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PatternDetailModal
        pattern={selectedPattern}
        isOpen={!!selectedPattern}
        onClose={() => setSelectedPattern(null)}
      />
    </div>
  );
};

export default PatternDependencies;

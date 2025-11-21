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
import { UnifiedGraph, type GraphNode, type GraphEdge } from '@/components/UnifiedGraph';
import {
  Clock,
  GitBranch,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Users,
  Calendar,
  Activity,
} from 'lucide-react';

interface PatternVersion {
  version: string;
  date: string;
  changes: string[];
  breaking: boolean;
  performance: number;
  stability: number;
  author: string;
  status: 'current' | 'deprecated' | 'legacy';
}

interface PatternEvolution {
  id: string;
  name: string;
  category: string;
  description: string;
  firstVersion: string;
  currentVersion: string;
  totalVersions: number;
  versions: PatternVersion[];
}

const PatternLineage: React.FC = () => {
  const [activeView, setActiveView] = useState('timeline');
  const [selectedPattern, setSelectedPattern] = useState<string>('auth-pattern');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Mock data for pattern evolution - showing version history over time
  const patternEvolutions: PatternEvolution[] = [
    {
      id: 'auth-pattern',
      name: 'Authentication Pattern',
      category: 'Security',
      description: 'Centralized authentication logic with JWT token management',
      firstVersion: '1.0.0',
      currentVersion: '2.1.0',
      totalVersions: 8,
      versions: [
        {
          version: '2.1.0',
          date: '2024-01-15',
          changes: [
            'Added OAuth2 support',
            'Improved JWT validation with better error messages',
            'Added support for refresh tokens',
            'Performance optimization for token verification',
          ],
          breaking: false,
          performance: 95,
          stability: 98,
          author: 'Team Alpha',
          status: 'current',
        },
        {
          version: '2.0.0',
          date: '2023-12-01',
          changes: [
            'Major API redesign for better usability',
            'Migrated from sessions to JWT tokens',
            'Added multi-factor authentication support',
            'Breaking: Changed authentication middleware signature',
          ],
          breaking: true,
          performance: 90,
          stability: 95,
          author: 'Team Alpha',
          status: 'deprecated',
        },
        {
          version: '1.9.0',
          date: '2023-11-15',
          changes: [
            'Fixed memory leak in session management',
            'Performance improvements for token validation',
            'Added logging for authentication failures',
          ],
          breaking: false,
          performance: 88,
          stability: 92,
          author: 'Team Alpha',
          status: 'deprecated',
        },
        {
          version: '1.8.0',
          date: '2023-10-20',
          changes: [
            'Added support for custom authentication strategies',
            'Improved error handling',
          ],
          breaking: false,
          performance: 85,
          stability: 90,
          author: 'Team Alpha',
          status: 'legacy',
        },
        {
          version: '1.7.0',
          date: '2023-09-10',
          changes: ['Added password reset functionality', 'Improved session security'],
          breaking: false,
          performance: 82,
          stability: 88,
          author: 'Team Beta',
          status: 'legacy',
        },
      ],
    },
    {
      id: 'error-handling',
      name: 'Error Handling',
      category: 'Error Management',
      description: 'Standardized error handling and exception management',
      firstVersion: '1.0.0',
      currentVersion: '1.8.2',
      totalVersions: 6,
      versions: [
        {
          version: '1.8.2',
          date: '2024-01-10',
          changes: [
            'Fixed memory leak in error aggregation',
            'Added new error types for network failures',
            'Improved error context propagation',
          ],
          breaking: false,
          performance: 88,
          stability: 95,
          author: 'Team Beta',
          status: 'current',
        },
        {
          version: '1.8.0',
          date: '2023-12-20',
          changes: [
            'Enhanced logging integration',
            'Better error context with stack traces',
            'Added error categorization',
          ],
          breaking: false,
          performance: 85,
          stability: 90,
          author: 'Team Beta',
          status: 'deprecated',
        },
        {
          version: '1.7.0',
          date: '2023-11-05',
          changes: ['Added async error handling support', 'Improved error reporting'],
          breaking: false,
          performance: 82,
          stability: 88,
          author: 'Team Beta',
          status: 'legacy',
        },
      ],
    },
    {
      id: 'data-validation',
      name: 'Data Validation',
      category: 'Data Management',
      description: 'Comprehensive data validation with schema-based rules',
      firstVersion: '1.0.0',
      currentVersion: '3.0.1',
      totalVersions: 10,
      versions: [
        {
          version: '3.0.1',
          date: '2024-01-20',
          changes: [
            'Fixed bug in array validation',
            'Performance optimization for large objects',
            'Added custom error messages',
          ],
          breaking: false,
          performance: 92,
          stability: 97,
          author: 'Team Gamma',
          status: 'current',
        },
        {
          version: '3.0.0',
          date: '2024-01-05',
          changes: [
            'Complete rewrite using Zod schema validation',
            'Breaking: Changed validation API',
            'Added TypeScript type inference',
            '50% performance improvement',
          ],
          breaking: true,
          performance: 90,
          stability: 93,
          author: 'Team Gamma',
          status: 'deprecated',
        },
        {
          version: '2.5.0',
          date: '2023-12-10',
          changes: ['Added async validation support', 'Improved error messages'],
          breaking: false,
          performance: 78,
          stability: 90,
          author: 'Team Gamma',
          status: 'legacy',
        },
      ],
    },
    {
      id: 'api-pattern',
      name: 'API Response Pattern',
      category: 'API Design',
      description: 'Standardized API response format and status handling',
      firstVersion: '1.0.0',
      currentVersion: '2.3.0',
      totalVersions: 7,
      versions: [
        {
          version: '2.3.0',
          date: '2024-01-18',
          changes: [
            'Added pagination support',
            'Improved response compression',
            'Added response caching headers',
          ],
          breaking: false,
          performance: 90,
          stability: 95,
          author: 'Team Delta',
          status: 'current',
        },
        {
          version: '2.2.0',
          date: '2023-12-15',
          changes: ['Added HATEOAS links support', 'Improved error response format'],
          breaking: false,
          performance: 88,
          stability: 92,
          author: 'Team Delta',
          status: 'deprecated',
        },
      ],
    },
    {
      id: 'caching-pattern',
      name: 'Caching Pattern',
      category: 'Performance',
      description: 'Multi-layer caching with intelligent invalidation',
      firstVersion: '1.0.0',
      currentVersion: '2.0.0',
      totalVersions: 5,
      versions: [
        {
          version: '2.0.0',
          date: '2024-01-14',
          changes: [
            'Complete redesign with Redis support',
            'Breaking: Changed cache key format',
            'Added distributed caching',
            '75% performance improvement',
          ],
          breaking: true,
          performance: 98,
          stability: 96,
          author: 'Team Epsilon',
          status: 'current',
        },
        {
          version: '1.5.0',
          date: '2023-11-20',
          changes: ['Added LRU cache strategy', 'Improved cache invalidation'],
          breaking: false,
          performance: 85,
          stability: 90,
          author: 'Team Epsilon',
          status: 'legacy',
        },
      ],
    },
  ];

  const filteredPatterns = patternEvolutions.filter((pattern) => {
    const matchesSearch =
      pattern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pattern.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || pattern.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedPatternData = patternEvolutions.find((p) => p.id === selectedPattern);

  // Memoize layout config to prevent infinite re-renders
  const hierarchyLayout = useMemo(() => ({ type: 'hierarchy' as const }), []);

  // Memoize color scheme to prevent infinite re-renders
  const graphColorScheme = useMemo(
    () => ({
      breaking: '#ef4444',
      evolution: '#3b82f6',
      current: '#10b981',
      deprecated: '#f59e0b',
      legacy: '#6b7280',
    }),
    []
  );

  // Convert pattern evolution to graph format for tree view
  const graphNodes: GraphNode[] =
    selectedPatternData?.versions.map((version) => ({
      id: `${selectedPattern}-${version.version}`,
      label: `v${version.version}`,
      type: version.status,
      color:
        version.status === 'current'
          ? '#10b981'
          : version.status === 'deprecated'
            ? '#f59e0b'
            : '#6b7280',
      size: Math.max(30, version.stability * 0.6), // Increased minimum size for better readability
      metadata: {
        version: version.version,
        date: version.date,
        changes: version.changes.length,
        breaking: version.breaking,
        performance: version.performance,
        stability: version.stability,
        author: version.author,
      },
    })) || [];

  // Create edges showing version progression with labels
  const graphEdges: GraphEdge[] = [];
  if (selectedPatternData) {
    for (let i = 0; i < selectedPatternData.versions.length - 1; i++) {
      const current = selectedPatternData.versions[i];
      const next = selectedPatternData.versions[i + 1];

      // Determine label based on version change characteristics
      let label = 'evolved to';
      if (current.breaking) {
        label = 'breaking →';
      } else if (current.changes.some((c) => c.toLowerCase().includes('fix'))) {
        label = 'fixed in';
      } else if (
        current.changes.some(
          (c) => c.toLowerCase().includes('optimize') || c.toLowerCase().includes('performance')
        )
      ) {
        label = 'optimized →';
      }

      graphEdges.push({
        source: `${selectedPattern}-${next.version}`,
        target: `${selectedPattern}-${current.version}`,
        weight: current.breaking ? 1 : 0.5,
        type: current.breaking ? 'breaking' : 'evolution',
        label: label,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label htmlFor="search">Search:</Label>
          <Input
            id="search"
            placeholder="Search patterns..."
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
          <Label htmlFor="pattern">Pattern:</Label>
          <Select value={selectedPattern} onValueChange={setSelectedPattern}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredPatterns.map((pattern) => (
                <SelectItem key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={activeView === 'timeline' ? 'default' : 'outline'}
          onClick={() => setActiveView('timeline')}
        >
          <Clock className="w-4 h-4 mr-2" />
          Timeline View
        </Button>
        <Button
          variant={activeView === 'tree' ? 'default' : 'outline'}
          onClick={() => setActiveView('tree')}
        >
          <GitBranch className="w-4 h-4 mr-2" />
          Tree View
        </Button>
        <Button
          variant={activeView === 'comparison' ? 'default' : 'outline'}
          onClick={() => setActiveView('comparison')}
        >
          <Activity className="w-4 h-4 mr-2" />
          Version Comparison
        </Button>
      </div>

      {/* Pattern Overview Card */}
      {selectedPatternData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedPatternData.name}
              <Badge>{selectedPatternData.category}</Badge>
              <Badge variant="outline">v{selectedPatternData.currentVersion}</Badge>
            </CardTitle>
            <CardDescription>{selectedPatternData.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">First Version</div>
                <div className="text-lg font-semibold">v{selectedPatternData.firstVersion}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Current Version</div>
                <div className="text-lg font-semibold">v{selectedPatternData.currentVersion}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Total Versions</div>
                <div className="text-lg font-semibold">{selectedPatternData.totalVersions}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Latest Update</div>
                <div className="text-lg font-semibold">{selectedPatternData.versions[0]?.date}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline View */}
      {activeView === 'timeline' && selectedPatternData && (
        <Card>
          <CardHeader>
            <CardTitle>Version Timeline</CardTitle>
            <CardDescription>
              Chronological history of pattern evolution showing versions and changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {selectedPatternData.versions.map((version, index) => (
                <div key={version.version} className="relative">
                  {/* Timeline connector */}
                  {index < selectedPatternData.versions.length - 1 && (
                    <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-border" />
                  )}

                  <div className="flex gap-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          version.status === 'current'
                            ? 'bg-green-100 text-green-600'
                            : version.status === 'deprecated'
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {version.status === 'current' ? (
                          <CheckCircle className="w-6 h-6" />
                        ) : version.breaking ? (
                          <AlertTriangle className="w-6 h-6" />
                        ) : (
                          <GitBranch className="w-6 h-6" />
                        )}
                      </div>
                    </div>

                    {/* Version details */}
                    <div className="flex-1 pb-8">
                      <div className="bg-card border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">v{version.version}</h3>
                            <Badge variant={version.status === 'current' ? 'default' : 'secondary'}>
                              {version.status}
                            </Badge>
                            {version.breaking && (
                              <Badge variant="destructive">Breaking Change</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {version.date}
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {version.author}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mb-3">
                          <div className="text-sm font-medium">Changes:</div>
                          <ul className="list-disc list-inside space-y-1">
                            {version.changes.map((change, i) => (
                              <li key={i} className="text-sm text-muted-foreground">
                                {change}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Performance:</span>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 w-24 bg-muted rounded-full h-2">
                                <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{ width: `${version.performance}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">{version.performance}%</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Stability:</span>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 w-24 bg-muted rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${version.stability}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium">{version.stability}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tree View */}
      {activeView === 'tree' && selectedPatternData && (
        <Card>
          <CardHeader>
            <CardTitle>Version Tree</CardTitle>
            <CardDescription>
              Visual representation of version evolution showing relationships
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnifiedGraph
              nodes={graphNodes}
              edges={graphEdges}
              layout={hierarchyLayout}
              height="600px"
              interactive={true}
              zoomable={true}
              showLegend={true}
              colorScheme={graphColorScheme}
            />
          </CardContent>
        </Card>
      )}

      {/* Version Comparison View */}
      {activeView === 'comparison' &&
        selectedPatternData &&
        selectedPatternData.versions.length >= 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Version Comparison</CardTitle>
              <CardDescription>
                Compare metrics and changes between different versions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedPatternData.versions.slice(0, 2).map((version) => (
                  <div key={version.version} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold">v{version.version}</h3>
                      <Badge variant={version.status === 'current' ? 'default' : 'secondary'}>
                        {version.status}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Release Date
                        </div>
                        <div className="text-sm">{version.date}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">Author</div>
                        <div className="text-sm">{version.author}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Performance
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: `${version.performance}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{version.performance}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Stability
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${version.stability}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{version.stability}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          Changes ({version.changes.length})
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {version.changes.slice(0, 3).map((change, i) => (
                            <li key={i} className="text-muted-foreground">
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedPatternData.versions.length >= 2 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold">Key Improvements</h4>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      Performance: +
                      {selectedPatternData.versions[0].performance -
                        selectedPatternData.versions[1].performance}
                      %
                    </li>
                    <li>
                      Stability: +
                      {selectedPatternData.versions[0].stability -
                        selectedPatternData.versions[1].stability}
                      %
                    </li>
                    <li>{selectedPatternData.versions[0].changes.length} new changes</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
};

export default PatternLineage;

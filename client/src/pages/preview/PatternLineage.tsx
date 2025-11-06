import React, { useState, useRef, useEffect } from "react";
import { MockDataBadge } from "@/components/MockDataBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PatternDetailModal } from "@/components/PatternDetailModal";
import { 
  Network, 
  Search, 
  Filter, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Download,
  Eye,
  Code,
  Layers,
  GitBranch,
  Clock,
  Users,
  Activity,
  ArrowRight,
  ArrowDown,
  Circle,
  Square,
  Triangle,
  Diamond,
  RefreshCw,
  Settings,
  Info
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
}

interface PatternConnection {
  from: string;
  to: string;
  type: 'dependency' | 'inheritance' | 'composition' | 'usage';
  strength: number;
  bidirectional: boolean;
}

interface PatternVersion {
  version: string;
  date: string;
  changes: string[];
  breaking: boolean;
  performance: number;
  stability: number;
}

const PatternLineage: React.FC = () => {
  const [activeView, setActiveView] = useState("graph");
  const [selectedPattern, setSelectedPattern] = useState<PatternNode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showVersions, setShowVersions] = useState(false);

  // Refs for dynamic line calculation
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Mock data for pattern nodes
  const patternNodes: PatternNode[] = [
    {
      id: "auth-pattern",
      name: "Authentication Pattern",
      type: 'pattern',
      version: "2.1.0",
      status: 'stable',
      usage: 15,
      performance: 95,
      complexity: 6,
      lastUpdated: "2024-01-15",
      author: "Team Alpha",
      dependencies: ["error-handling", "session-management"],
      dependents: ["user-service", "admin-service", "api-gateway"],
      files: ["auth-pattern.ts", "auth-middleware.ts", "auth-guard.ts"],
      description: "Centralized authentication logic with JWT token management",
      category: "Security"
    },
    {
      id: "error-handling",
      name: "Error Handling",
      type: 'pattern',
      version: "1.8.2",
      status: 'stable',
      usage: 23,
      performance: 88,
      complexity: 4,
      lastUpdated: "2024-01-10",
      author: "Team Beta",
      dependencies: ["logging-pattern"],
      dependents: ["auth-pattern", "api-pattern", "data-validation"],
      files: ["error-handler.ts", "exception-manager.ts", "error-types.ts"],
      description: "Standardized error handling and exception management",
      category: "Error Management"
    },
    {
      id: "data-validation",
      name: "Data Validation",
      type: 'pattern',
      version: "3.0.1",
      status: 'stable',
      usage: 31,
      performance: 92,
      complexity: 7,
      lastUpdated: "2024-01-20",
      author: "Team Gamma",
      dependencies: ["error-handling", "type-definitions"],
      dependents: ["form-handler", "api-pattern", "data-transformer"],
      files: ["validator.ts", "schema-builder.ts", "validation-rules.ts"],
      description: "Comprehensive data validation with schema-based rules",
      category: "Data Management"
    },
    {
      id: "api-pattern",
      name: "API Response Pattern",
      type: 'pattern',
      version: "2.3.0",
      status: 'stable',
      usage: 18,
      performance: 90,
      complexity: 5,
      lastUpdated: "2024-01-18",
      author: "Team Delta",
      dependencies: ["error-handling", "data-validation"],
      dependents: ["user-service", "product-service", "order-service"],
      files: ["api-response.ts", "response-builder.ts", "status-codes.ts"],
      description: "Standardized API response format and status handling",
      category: "API Design"
    },
    {
      id: "session-management",
      name: "Session Management",
      type: 'pattern',
      version: "1.5.0",
      status: 'stable',
      usage: 12,
      performance: 85,
      complexity: 8,
      lastUpdated: "2024-01-12",
      author: "Team Alpha",
      dependencies: ["data-validation", "caching-pattern"],
      dependents: ["auth-pattern", "user-service"],
      files: ["session-manager.ts", "session-store.ts", "session-middleware.ts"],
      description: "Secure session management with Redis backend",
      category: "Security"
    },
    {
      id: "caching-pattern",
      name: "Caching Pattern",
      type: 'pattern',
      version: "2.0.0",
      status: 'stable',
      usage: 20,
      performance: 98,
      complexity: 6,
      lastUpdated: "2024-01-14",
      author: "Team Epsilon",
      dependencies: [],
      dependents: ["session-management", "data-fetcher", "api-pattern"],
      files: ["cache-manager.ts", "cache-strategies.ts", "cache-invalidator.ts"],
      description: "Multi-layer caching with intelligent invalidation",
      category: "Performance"
    },
    {
      id: "logging-pattern",
      name: "Logging Pattern",
      type: 'pattern',
      version: "1.3.0",
      status: 'stable',
      usage: 28,
      performance: 82,
      complexity: 3,
      lastUpdated: "2024-01-08",
      author: "Team Beta",
      dependencies: [],
      dependents: ["error-handling", "api-pattern"],
      files: ["logger.ts", "log-formatter.ts", "log-levels.ts"],
      description: "Structured logging with context propagation",
      category: "Observability"
    },
    {
      id: "type-definitions",
      name: "Type Definitions",
      type: 'dependency',
      version: "4.2.0",
      status: 'stable',
      usage: 45,
      performance: 100,
      complexity: 2,
      lastUpdated: "2024-01-05",
      author: "Team Gamma",
      dependencies: [],
      dependents: ["data-validation", "api-pattern"],
      files: ["types.ts", "interfaces.ts"],
      description: "Shared TypeScript type definitions",
      category: "Type Safety"
    },
    {
      id: "data-fetcher",
      name: "Data Fetcher",
      type: 'implementation',
      version: "1.0.0",
      status: 'stable',
      usage: 14,
      performance: 89,
      complexity: 5,
      lastUpdated: "2024-01-11",
      author: "Team Epsilon",
      dependencies: ["caching-pattern"],
      dependents: [],
      files: ["data-fetcher.ts", "fetch-strategies.ts"],
      description: "Optimized data fetching with caching layer",
      category: "Data Management"
    }
  ];

  // Mock data for pattern connections - ensuring 2-3 hop lineage is visible
  // Example: auth-pattern -> error-handling -> logging-pattern (3 hops)
  // Example: api-pattern -> data-validation -> type-definitions (3 hops)
  const patternConnections: PatternConnection[] = [
    // Direct dependencies (hop 1)
    { from: "auth-pattern", to: "error-handling", type: 'dependency', strength: 0.8, bidirectional: false },
    { from: "auth-pattern", to: "session-management", type: 'dependency', strength: 0.9, bidirectional: false },
    { from: "data-validation", to: "error-handling", type: 'dependency', strength: 0.6, bidirectional: false },
    { from: "data-validation", to: "type-definitions", type: 'dependency', strength: 0.7, bidirectional: false },
    { from: "api-pattern", to: "error-handling", type: 'dependency', strength: 0.8, bidirectional: false },
    { from: "api-pattern", to: "data-validation", type: 'dependency', strength: 0.7, bidirectional: false },
    { from: "session-management", to: "data-validation", type: 'dependency', strength: 0.5, bidirectional: false },
    { from: "session-management", to: "caching-pattern", type: 'dependency', strength: 0.8, bidirectional: false },
    
    // Second hop dependencies (hop 2)
    { from: "error-handling", to: "logging-pattern", type: 'dependency', strength: 0.7, bidirectional: false },
    { from: "api-pattern", to: "logging-pattern", type: 'usage', strength: 0.6, bidirectional: false },
    
    // Third hop dependencies (hop 3)
    { from: "caching-pattern", to: "data-fetcher", type: 'usage', strength: 0.6, bidirectional: true },
    { from: "caching-pattern", to: "api-pattern", type: 'usage', strength: 0.5, bidirectional: true },
    
    // Additional connections for clear lineage visualization
    { from: "type-definitions", to: "api-pattern", type: 'usage', strength: 0.4, bidirectional: false }
  ];

  // Mock data for pattern versions
  const patternVersions: { [patternId: string]: PatternVersion[] } = {
    "auth-pattern": [
      { version: "2.1.0", date: "2024-01-15", changes: ["Added OAuth2 support", "Improved JWT validation"], breaking: false, performance: 95, stability: 98 },
      { version: "2.0.0", date: "2023-12-01", changes: ["Major refactor", "New API design"], breaking: true, performance: 90, stability: 95 },
      { version: "1.9.0", date: "2023-11-15", changes: ["Bug fixes", "Performance improvements"], breaking: false, performance: 88, stability: 92 }
    ],
    "error-handling": [
      { version: "1.8.2", date: "2024-01-10", changes: ["Fixed memory leak", "Added new error types"], breaking: false, performance: 88, stability: 95 },
      { version: "1.8.0", date: "2023-12-20", changes: ["Enhanced logging", "Better error context"], breaking: false, performance: 85, stability: 90 }
    ]
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'pattern': return <Layers className="w-4 h-4" />;
      case 'implementation': return <Code className="w-4 h-4" />;
      case 'dependency': return <GitBranch className="w-4 h-4" />;
      case 'version': return <Clock className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  const getNodeShape = (type: string) => {
    switch (type) {
      case 'pattern': return <Square className="w-6 h-6" />;
      case 'implementation': return <Circle className="w-6 h-6" />;
      case 'dependency': return <Diamond className="w-6 h-6" />;
      case 'version': return <Triangle className="w-6 h-6" />;
      default: return <Circle className="w-6 h-6" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable': return 'default';
      case 'experimental': return 'secondary';
      case 'deprecated': return 'destructive';
      case 'active': return 'default';
      default: return 'outline';
    }
  };

  const getPerformanceColor = (performance: number) => {
    if (performance >= 90) return 'text-green-600';
    if (performance >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredNodes = patternNodes.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || node.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate dynamic node positions for accurate line drawing
  useEffect(() => {
    const updateNodePositions = () => {
      if (!svgRef.current || !containerRef.current) return;

      const svgRect = svgRef.current.getBoundingClientRect();
      const nodes = containerRef.current.querySelectorAll('[data-pattern-node]');
      const positions: Record<string, { x: number; y: number }> = {};

      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const nodeId = node.getAttribute('data-pattern-node');
        if (nodeId) {
          // Calculate center of the node relative to SVG
          positions[nodeId] = {
            x: rect.left - svgRect.left + rect.width / 2,
            y: rect.top - svgRect.top + rect.height / 2,
          };
        }
      });

      setNodePositions(positions);
    };

    // Update positions after render and when zoom changes
    const timeoutId = setTimeout(updateNodePositions, 100);

    // Add resize listener
    window.addEventListener('resize', updateNodePositions);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateNodePositions);
    };
  }, [zoomLevel, selectedPattern, activeView]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pattern Lineage</h1>
          <p className="ty-subtitle">
            Visualize pattern dependencies, evolution, and relationships
          </p>
        </div>
        <div className="flex gap-2">
          <MockDataBadge />
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Graph
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

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

        <div className="flex items-center gap-4">
          <Button
            variant={showDependencies ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDependencies(!showDependencies)}
          >
            <Network className="w-4 h-4 mr-2" />
            Dependencies
          </Button>
          <Button
            variant={showVersions ? "default" : "outline"}
            size="sm"
            onClick={() => setShowVersions(!showVersions)}
          >
            <GitBranch className="w-4 h-4 mr-2" />
            Versions
          </Button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button 
          variant={activeView === "graph" ? "default" : "outline"} 
          onClick={() => setActiveView("graph")}
        >
          <Network className="w-4 h-4 mr-2" />
          Graph View
        </Button>
        <Button 
          variant={activeView === "list" ? "default" : "outline"} 
          onClick={() => setActiveView("list")}
        >
          <Layers className="w-4 h-4 mr-2" />
          List View
        </Button>
        <Button 
          variant={activeView === "timeline" ? "default" : "outline"} 
          onClick={() => setActiveView("timeline")}
        >
          <Clock className="w-4 h-4 mr-2" />
          Timeline
        </Button>
      </div>

      {/* Graph View */}
      {activeView === "graph" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Pattern Dependency Graph</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}>
                  <ZoomIn className="w-4 h-4 mr-2" />
                  Zoom In
                </Button>
                <Button variant="outline" size="sm" onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}>
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
              Interactive visualization of pattern relationships and dependencies
            </CardDescription>
          </CardHeader>
          <CardContent>
              <div className="h-[calc(100vh-24rem)] bg-muted rounded-lg relative overflow-hidden">
              {/* Interactive graph visualization */}
              <div
                ref={containerRef}
                className="absolute inset-0 p-6"
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center'
                }}
              >
                <div className="grid grid-cols-4 gap-12 h-full min-h-[600px]">
                  {/* Top row - Auth Pattern */}
                  <div className="col-span-1 flex justify-center items-start pt-8">
                    <div
                      data-pattern-node="auth-pattern"
                      className="bg-card border-2 border-blue-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[0])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-blue-500" />
                        <span className="font-semibold text-lg">Auth Pattern</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v2.1.0</div>
                      <div className="text-xs text-blue-600">15 uses • 95% perf</div>
                    </div>
                  </div>
                  
                  {/* Middle row - Error Handling and Data Validation */}
                  <div className="col-span-1 flex justify-center items-center">
                    <div
                      data-pattern-node="error-handling"
                      className="bg-card border-2 border-green-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[1])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-green-500" />
                        <span className="font-semibold text-lg">Error Handling</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v1.8.2</div>
                      <div className="text-xs text-green-600">23 uses • 88% perf</div>
                    </div>
                  </div>
                  
                  <div className="col-span-1 flex justify-center items-center">
                    <div
                      data-pattern-node="data-validation"
                      className="bg-card border-2 border-purple-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[2])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-purple-500" />
                        <span className="font-semibold text-lg">Data Validation</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v3.0.1</div>
                      <div className="text-xs text-purple-600">31 uses • 92% perf</div>
                    </div>
                  </div>
                  
                  {/* Bottom row - API Pattern, Session Mgmt, Caching */}
                  <div className="col-span-1 flex justify-center items-end pb-8">
                    <div
                      data-pattern-node="api-pattern"
                      className="bg-card border-2 border-orange-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[3])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-orange-500" />
                        <span className="font-semibold text-lg">API Pattern</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v2.3.0</div>
                      <div className="text-xs text-orange-600">18 uses • 90% perf</div>
                    </div>
                  </div>
                  
                  <div className="col-span-1 flex justify-center items-end pb-8">
                    <div
                      data-pattern-node="session-management"
                      className="bg-card border-2 border-red-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[4])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-red-500" />
                        <span className="font-semibold text-lg">Session Mgmt</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v1.5.0</div>
                      <div className="text-xs text-red-600">12 uses • 85% perf</div>
                    </div>
                  </div>
                  
                  <div className="col-span-1 flex justify-center items-end pb-8">
                    <div
                      data-pattern-node="caching-pattern"
                      className="bg-card border-2 border-teal-500 text-foreground rounded-lg p-4 shadow-lg cursor-pointer hover:shadow-xl transition-shadow min-w-[200px]"
                      onClick={() => setSelectedPattern(patternNodes[5])}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-teal-500" />
                        <span className="font-semibold text-lg">Caching</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">v2.0.0</div>
                      <div className="text-xs text-teal-600">20 uses • 98% perf</div>
                    </div>
                  </div>
                </div>
                
                {/* Connection lines with dynamic positioning */}
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                  {/* Only render lines when positions are calculated */}
                  {Object.keys(nodePositions).length > 0 && patternConnections.map((conn, idx) => {
                    const fromPos = nodePositions[conn.from];
                    const toPos = nodePositions[conn.to];

                    if (!fromPos || !toPos) return null;

                    // Color mapping based on connection type
                    const colorMap: Record<string, string> = {
                      'dependency': '#3b82f6',
                      'inheritance': '#10b981',
                      'composition': '#8b5cf6',
                      'usage': '#f59e0b',
                    };
                    const strokeColor = colorMap[conn.type] || '#94a3b8';

                    // Calculate midpoint for marker
                    const midX = (fromPos.x + toPos.x) / 2;
                    const midY = (fromPos.y + toPos.y) / 2;

                    return (
                      <g key={`connection-${idx}`}>
                        <line
                          x1={fromPos.x}
                          y1={fromPos.y}
                          x2={toPos.x}
                          y2={toPos.y}
                          stroke={strokeColor}
                          strokeWidth={2 + conn.strength * 2}
                          strokeDasharray="8,4"
                          opacity={0.6 + conn.strength * 0.3}
                        />
                        <circle
                          cx={midX}
                          cy={midY}
                          r="3"
                          fill={strokeColor}
                          opacity={0.8}
                        />
                        {/* Arrow indicator */}
                        {!conn.bidirectional && (
                          <polygon
                            points={`${toPos.x - 8},${toPos.y - 5} ${toPos.x},${toPos.y} ${toPos.x - 8},${toPos.y + 5}`}
                            fill={strokeColor}
                            opacity={0.8}
                            transform={`rotate(${Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x) * 180 / Math.PI}, ${toPos.x}, ${toPos.y})`}
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              
              {/* Zoom level indicator */}
              <div className="absolute top-4 right-4 bg-muted/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-medium shadow-lg">
                {zoomLevel}%
              </div>
              
              {/* Instructions */}
              <div className="absolute bottom-4 left-4 bg-muted/90 backdrop-blur-sm rounded-lg px-4 py-2 text-sm shadow-lg">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Click nodes to select • Use zoom controls • Drag to pan</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {activeView === "list" && (
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
                        <Badge variant={getStatusColor(node.status)}>
                          {node.status}
                        </Badge>
                        <Badge variant="outline">
                          v{node.version}
                        </Badge>
                      </CardTitle>
                      <CardDescription>{node.description}</CardDescription>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${getPerformanceColor(node.performance)}`}>
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
                    {node.dependencies.map((dep, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Used by:</div>
                  <div className="flex flex-wrap gap-1">
                    {node.dependents.map((dep, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm" 
                    onClick={() => setSelectedPattern(node)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </Button>
                  <Button variant="outline" size="sm">
                    <Code className="w-4 h-4 mr-2" />
                    View Code
                  </Button>
                  <Button variant="outline" size="sm">
                    <GitBranch className="w-4 h-4 mr-2" />
                    Version History
                  </Button>
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Timeline View */}
      {activeView === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle>Pattern Evolution Timeline</CardTitle>
            <CardDescription>
              Track how patterns have evolved over time with version changes and dependencies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
              <div className="text-center">
                <Clock className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Timeline visualization would go here</p>
                <p className="text-sm text-muted-foreground">
                  Interactive timeline showing pattern evolution, version releases, and dependency changes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PatternDetailModal
        pattern={selectedPattern}
        isOpen={!!selectedPattern}
        onClose={() => setSelectedPattern(null)}
      />
    </div>
  );
};

export default PatternLineage;

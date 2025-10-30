import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Eye, 
  Star, 
  Zap, 
  Shield, 
  BarChart3, 
  Settings, 
  Bell,
  Download,
  Upload,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Info,
  ArrowRight,
  ExternalLink,
  Clock,
  Brain,
  Lightbulb,
  Layers,
  Cpu,
  HardDrive,
  Wifi,
  Target,
  Users,
  Globe,
  Lock,
  Unlock,
  Database,
  PieChart,
  LineChart,
  Workflow,
  FileText,
  Code,
  ScrollText,
  HardDrive as HardDriveIcon,
  Database as DatabaseIcon
} from "lucide-react";

export default function FeatureShowcase() {
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [demoProgress, setDemoProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const features = [
    {
      id: "real-time-monitoring",
      title: "Real-Time Monitoring",
      description: "Live monitoring of system metrics with WebSocket updates",
      status: "available",
      category: "Monitoring",
      icon: BarChart3,
      demo: {
        description: "Watch live metrics update in real-time",
        steps: [
          "Connect to WebSocket stream",
          "Display live data updates",
          "Show performance trends",
          "Alert on threshold breaches"
        ]
      }
    },
    {
      id: "ai-model-performance",
      title: "AI Model Performance Dashboard",
      description: "Real-time monitoring and comparison of AI model performance across different providers",
      status: "available",
      category: "AI & ML",
      icon: Brain,
      demo: {
        description: "Compare AI models side by side",
        steps: [
          "Load model performance data",
          "Compare response times",
          "Analyze cost per request",
          "View success rate trends"
        ]
      }
    },
    {
      id: "predictive-analytics",
      title: "Predictive Analytics Engine",
      description: "ML-powered system behavior forecasting and anomaly detection",
      status: "beta",
      category: "Analytics",
      icon: Zap,
      demo: {
        description: "See how AI predicts system behavior",
        steps: [
          "Analyze historical patterns",
          "Generate predictions",
          "Detect anomalies",
          "Provide recommendations"
        ]
      }
    },
    {
      id: "code-quality-gates",
      title: "Automated Code Quality Gates",
      description: "AI-powered code quality monitoring with real-time feedback and automated suggestions",
      status: "beta",
      category: "Development",
      icon: Code,
      demo: {
        description: "Experience automated code quality monitoring",
        steps: [
          "Scan code repository",
          "Analyze code quality metrics",
          "Generate improvement suggestions",
          "Apply automated fixes"
        ]
      }
    },
    {
      id: "custom-dashboard-builder",
      title: "Custom Dashboard Builder",
      description: "Drag-and-drop dashboard creation system for personalized data visualization",
      status: "available",
      category: "Visualization",
      icon: PieChart,
      demo: {
        description: "Build your own custom dashboards",
        steps: [
          "Drag widgets onto canvas",
          "Configure data sources",
          "Customize visualizations",
          "Save and share dashboard"
        ]
      }
    },
    {
      id: "security-compliance-center",
      title: "Security & Compliance Center",
      description: "Comprehensive security monitoring and compliance reporting system",
      status: "coming-soon",
      category: "Security",
      icon: Shield,
      demo: {
        description: "Experience enhanced security features",
        steps: [
          "Configure 2FA settings",
          "Set up IP whitelisting",
          "Enable audit logging",
          "Monitor security events"
        ]
      }
    },
    {
      id: "agent-workflow-builder",
      title: "Agent Workflow Builder",
      description: "N8N-style workflow builder with all available nodes for agent orchestration",
      status: "planned",
      category: "Workflow",
      icon: Workflow,
      demo: {
        description: "Build complex agent workflows visually",
        steps: [
          "Drag workflow nodes",
          "Connect agent actions",
          "Configure triggers",
          "Deploy and test workflow"
        ]
      }
    },
    {
      id: "code-graph-ui",
      title: "Code Graph UI",
      description: "Interactive visualization of code dependencies with searchable and zoomable interface",
      status: "planned",
      category: "Development",
      icon: Layers,
      demo: {
        description: "Explore code dependencies visually",
        steps: [
          "Load codebase structure",
          "Navigate dependency graph",
          "Search for specific components",
          "Identify orphaned code"
        ]
      }
    },
    {
      id: "context-graph",
      title: "Context Graph",
      description: "Visualization of most used context in the system with temporal change tracking",
      status: "planned",
      category: "Analytics",
      icon: Target,
      demo: {
        description: "Track context usage over time",
        steps: [
          "Load context usage data",
          "Visualize context relationships",
          "Track changes over time",
          "Identify optimization opportunities"
        ]
      }
    },
    {
      id: "test-intelligence",
      title: "Test Intelligence System",
      description: "AI-powered test generation and coverage analysis with automated optimization",
      status: "coming-soon",
      category: "Testing",
      icon: CheckCircle,
      demo: {
        description: "Automatically generate and optimize tests",
        steps: [
          "Analyze code changes",
          "Generate test cases",
          "Run coverage analysis",
          "Optimize test suite"
        ]
      }
    },
    {
      id: "resource-optimization",
      title: "Resource Optimization Engine",
      description: "AI-powered cost and performance optimization recommendations",
      status: "beta",
      category: "Optimization",
      icon: Lightbulb,
      demo: {
        description: "Get AI-powered optimization suggestions",
        steps: [
          "Analyze current resource usage",
          "Identify optimization opportunities",
          "Generate recommendations",
          "Apply optimizations automatically"
        ]
      }
    },
    {
      id: "collaboration-hub",
      title: "Collaboration Hub",
      description: "Team collaboration and knowledge management system with shared workflows",
      status: "planned",
      category: "Collaboration",
      icon: Users,
      demo: {
        description: "Explore team collaboration features",
        steps: [
          "Create shared dashboards",
          "Add team annotations",
          "Set up alerts",
          "Generate reports"
        ]
      }
    },
    {
      id: "integration-marketplace",
      title: "Integration Marketplace",
      description: "Plugin system and third-party tool integration platform",
      status: "planned",
      category: "Integration",
      icon: Globe,
      demo: {
        description: "Discover and install integrations",
        steps: [
          "Browse available plugins",
          "Preview integration features",
          "Install and configure",
          "Test integration functionality"
        ]
      }
    },
    {
      id: "mobile-app",
      title: "Mobile Application",
      description: "Mobile-optimized monitoring and management application with offline capabilities",
      status: "planned",
      category: "Mobile",
      icon: Wifi,
      demo: {
        description: "Experience mobile monitoring features",
        steps: [
          "View mobile-optimized dashboards",
          "Receive push notifications",
          "Use voice commands",
          "Access offline features"
        ]
      }
    },
    {
      id: "intelligent-ticketing-system",
      title: "Intelligent Ticketing System",
      description: "AI-powered ticketing system with RSD prioritization, workflow orchestration, and JIRA integration",
      status: "available",
      category: "Workflow",
      icon: FileText,
      demo: {
        description: "Experience intelligent ticket management with RSD prioritization",
        steps: [
          "Create new ticket with AI assistance",
          "View RSD priority calculation",
          "Watch workflow orchestration",
          "Test JIRA integration"
        ]
      }
    }
  ];

  const categories = ["All", "AI & ML", "Analytics", "Development", "Visualization", "Security", "Workflow", "Testing", "Optimization", "Collaboration", "Integration", "Mobile"];

  const [searchQuery, setSearchQuery] = useState("");

  const filteredFeatures = features.filter(feature => {
    const matchesCategory = selectedCategory === "All" || feature.category === selectedCategory;
    const matchesSearch = feature.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         feature.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "beta": return "bg-yellow-500";
      case "coming-soon": return "bg-blue-500";
      case "planned": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available": return "Available";
      case "beta": return "Beta";
      case "coming-soon": return "Coming Soon";
      case "planned": return "Planned";
      default: return "Unknown";
    }
  };

  const startDemo = (featureId: string) => {
    setActiveDemo(featureId);
    setDemoProgress(0);
    
    // Simulate demo progress
    const interval = setInterval(() => {
      setDemoProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  const stopDemo = () => {
    setActiveDemo(null);
    setDemoProgress(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feature Showcase</h1>
          <p className="text-muted-foreground">
            Explore upcoming features and enhancements for the OmniNode platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Demo Details - Moved above search */}
      {activeDemo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              Live Demo: {features.find(f => f.id === activeDemo)?.title}
            </CardTitle>
            <CardDescription>
              {features.find(f => f.id === activeDemo)?.demo.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Demo Steps</h4>
                  <div className="space-y-2">
                    {features.find(f => f.id === activeDemo)?.demo.steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          index * 25 < demoProgress ? 'bg-green-500 text-white' : 'bg-muted'
                        }`}>
                          {index * 25 < demoProgress ? <CheckCircle className="w-4 h-4" /> : index + 1}
                        </div>
                        <span className="text-sm">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Live Preview</h4>
                  <div className="border rounded-lg p-4 bg-muted/50 min-h-[300px]">
                    {activeDemo === "real-time-monitoring" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">System Metrics</h5>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-sm text-green-600">Live</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-card rounded p-3 shadow">
                            <div className="text-sm text-muted-foreground">CPU Usage</div>
                            <div className="text-2xl font-bold text-blue-600">67%</div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                              <div className="bg-blue-600 h-2 rounded-full" style={{width: '67%'}}></div>
                            </div>
                          </div>
                          <div className="bg-card rounded p-3 shadow">
                            <div className="text-sm text-muted-foreground">Memory</div>
                            <div className="text-2xl font-bold text-green-600">4.2GB</div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                              <div className="bg-green-600 h-2 rounded-full" style={{width: '42%'}}></div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-card rounded p-3 shadow">
                          <div className="text-sm text-muted-foreground mb-2">Active Connections</div>
                          <div className="flex items-center gap-2">
                            <div className="text-2xl font-bold">1,247</div>
                            <div className="text-sm text-green-600">+23 in last minute</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "ai-model-performance" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">AI Model Comparison</h5>
                          <Badge variant="default">Live Data</Badge>
                        </div>
                        <div className="space-y-3">
                          <div className="bg-card rounded p-3 shadow flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                              <span className="font-medium">GPT-4</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>Response: 1.2s</span>
                              <span>Cost: $0.03</span>
                              <span className="text-green-600">Success: 98%</span>
                            </div>
                          </div>
                          <div className="bg-card rounded p-3 shadow flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                              <span className="font-medium">Claude-3</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>Response: 0.8s</span>
                              <span>Cost: $0.02</span>
                              <span className="text-green-600">Success: 96%</span>
                            </div>
                          </div>
                          <div className="bg-card rounded p-3 shadow flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                              <span className="font-medium">Gemini Pro</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>Response: 1.5s</span>
                              <span>Cost: $0.025</span>
                              <span className="text-yellow-600">Success: 94%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "predictive-analytics" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Predictive Analysis Dashboard</h5>
                          <Badge variant="secondary">Beta</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-card rounded p-3 shadow">
                            <div className="text-sm text-muted-foreground mb-2">System Load Forecast</div>
                            <div className="h-20 bg-gradient-to-r from-blue-100 to-blue-200 rounded flex items-end">
                              <div className="w-full h-3/4 bg-blue-500 rounded-t opacity-80"></div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Predicted: 85% in 2 hours</div>
                          </div>
                          <div className="bg-card rounded p-3 shadow">
                            <div className="text-sm text-muted-foreground mb-2">Anomaly Detection</div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                              <span className="text-sm font-medium">3 anomalies detected</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Last: 15 minutes ago</div>
                          </div>
                        </div>
                        <div className="bg-card rounded p-3 shadow">
                          <div className="text-sm text-muted-foreground mb-2">AI Recommendations</div>
                          <div className="space-y-1">
                            <div className="text-xs flex items-center gap-2">
                              <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                              Scale up database instances
                            </div>
                            <div className="text-xs flex items-center gap-2">
                              <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                              Increase cache size by 2GB
                            </div>
                            <div className="text-xs flex items-center gap-2">
                              <div className="w-1 h-1 bg-yellow-500 rounded-full"></div>
                              Schedule maintenance window
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "intelligent-ticketing-system" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">RSD Priority Engine</h5>
                          <Badge variant="default">Calculating</Badge>
                        </div>
                        <div className="bg-card rounded p-4 shadow">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium">Fix Authentication Bug</span>
                            <Badge variant="destructive">Priority: 142</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Dependency Score:</span>
                              <span className="ml-2 font-semibold text-red-600">85/100</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Failure Impact:</span>
                              <span className="ml-2 font-semibold text-orange-600">72/100</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Time Decay:</span>
                              <span className="ml-2 font-semibold text-yellow-600">45/100</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Agent Requests:</span>
                              <span className="ml-2 font-semibold text-blue-600">12</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-card rounded p-3 shadow">
                          <div className="text-sm text-muted-foreground mb-2">Workflow Status</div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-sm">Assigned to Agent Alpha</span>
                            <Badge variant="outline" className="ml-auto">In Progress</Badge>
                          </div>
                        </div>
                      </div>
                    )}


                    {activeDemo === "agent-workflow-builder" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">N8N-Style Workflow</h5>
                          <Badge variant="default">Building</Badge>
                        </div>
                        <div className="bg-card rounded p-4 shadow">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="border-2 border-dashed border-gray-300 rounded p-3 text-center">
                              <div className="text-sm text-muted-foreground">Trigger</div>
                              <div className="font-medium">Webhook</div>
                            </div>
                            <div className="border-2 border-blue-500 rounded p-3 text-center bg-blue-50">
                              <div className="text-sm text-blue-600">Process</div>
                              <div className="font-medium">AI Analysis</div>
                            </div>
                            <div className="border-2 border-dashed border-gray-300 rounded p-3 text-center">
                              <div className="text-sm text-muted-foreground">Action</div>
                              <div className="font-medium">Send Email</div>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Available Nodes:</div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">HTTP Request</Badge>
                              <Badge variant="outline">Database Query</Badge>
                              <Badge variant="outline">AI Processing</Badge>
                              <Badge variant="outline">Email Send</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "code-graph-ui" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Code Dependency Graph</h5>
                          <Badge variant="default">Analyzing</Badge>
                        </div>
                        <div className="bg-card rounded p-4 shadow">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center">
                              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <Code className="w-8 h-8 text-blue-600" />
                              </div>
                              <div className="font-medium">auth-service.ts</div>
                              <div className="text-sm text-muted-foreground">15 dependencies</div>
                            </div>
                            <div className="text-center">
                              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                <Database className="w-8 h-8 text-green-600" />
                              </div>
                              <div className="font-medium">user-db.ts</div>
                              <div className="text-sm text-muted-foreground">3 dependencies</div>
                            </div>
                          </div>
                          <div className="mt-4 text-center">
                            <div className="text-sm text-muted-foreground">Orphaned Files Detected:</div>
                            <div className="font-semibold text-red-600">2 files</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "context-graph" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Context Usage Over Time</h5>
                          <Badge variant="default">Tracking</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Authentication Context</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-600 h-2 rounded-full" style={{width: '85%'}}></div>
                                </div>
                                <span className="text-sm text-blue-600">85%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">User Management Context</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-600 h-2 rounded-full" style={{width: '72%'}}></div>
                                </div>
                                <span className="text-sm text-green-600">72%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">API Gateway Context</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-purple-600 h-2 rounded-full" style={{width: '58%'}}></div>
                                </div>
                                <span className="text-sm text-purple-600">58%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "code-quality-gates" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Code Quality Gates</h5>
                          <Badge variant="default">Scanning</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Code Coverage</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-600 h-2 rounded-full" style={{width: '87%'}}></div>
                                </div>
                                <span className="text-sm text-green-600">87%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Security Vulnerabilities</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">2 Critical</Badge>
                                <Badge variant="secondary">5 Medium</Badge>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Performance Score</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-yellow-600 h-2 rounded-full" style={{width: '72%'}}></div>
                                </div>
                                <span className="text-sm text-yellow-600">72/100</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">AI Suggestions:</div>
                            <div className="space-y-1">
                              <div className="text-xs">• Add error handling to user authentication</div>
                              <div className="text-xs">• Optimize database queries in payment service</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "custom-dashboard-builder" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Drag & Drop Builder</h5>
                          <Badge variant="default">Building</Badge>
                        </div>
                        <div className="bg-card rounded p-4 shadow">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="border-2 border-dashed border-gray-300 rounded p-3 text-center">
                              <BarChart3 className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                              <div className="text-sm text-muted-foreground">Chart Widget</div>
                            </div>
                            <div className="border-2 border-dashed border-gray-300 rounded p-3 text-center">
                              <Database className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                              <div className="text-sm text-muted-foreground">Data Table</div>
                            </div>
                            <div className="border-2 border-blue-500 rounded p-3 text-center bg-blue-50">
                              <Activity className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                              <div className="text-sm text-blue-600">Live Metrics</div>
                            </div>
                            <div className="border-2 border-dashed border-gray-300 rounded p-3 text-center">
                              <Alert className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                              <div className="text-sm text-muted-foreground">Alert Panel</div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Available Widgets:</div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">Metrics</Badge>
                              <Badge variant="outline">Charts</Badge>
                              <Badge variant="outline">Tables</Badge>
                              <Badge variant="outline">Alerts</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "security-compliance-center" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Security & Compliance</h5>
                          <Badge variant="default">Scanning</Badge>
                        </div>
                        <div className="bg-card rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">GDPR Compliance</span>
                              <Badge variant="default">98%</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">SOC 2 Type II</span>
                              <Badge variant="default">95%</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Security Vulnerabilities</span>
                              <Badge variant="destructive">3</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Data Encryption</span>
                              <Badge variant="default">100%</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Recent Scans:</div>
                            <div className="space-y-1">
                              <div className="text-xs">• OWASP Top 10: Passed</div>
                              <div className="text-xs">• Dependency Check: 2 vulnerabilities found</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "test-intelligence" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">AI Test Generation</h5>
                          <Badge variant="default">Generating</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Test Coverage</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div className="bg-green-600 h-2 rounded-full" style={{width: '92%'}}></div>
                                </div>
                                <span className="text-sm text-green-600">92%</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Generated Tests</span>
                              <Badge variant="default">47</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Pass Rate</span>
                              <Badge variant="default">94%</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">AI Suggestions:</div>
                            <div className="space-y-1">
                              <div className="text-xs">• Add edge case test for null input</div>
                              <div className="text-xs">• Generate performance test for large datasets</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "resource-optimization" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Resource Optimization</h5>
                          <Badge variant="default">Analyzing</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Cost Savings Potential</span>
                              <Badge variant="default">$2,340/month</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Performance Gains</span>
                              <Badge variant="default">+23%</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Underutilized Resources</span>
                              <Badge variant="secondary">12 instances</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Recommendations:</div>
                            <div className="space-y-1">
                              <div className="text-xs">• Scale down 3 over-provisioned instances</div>
                              <div className="text-xs">• Enable auto-scaling for API gateway</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "collaboration-hub" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Team Collaboration</h5>
                          <Badge variant="default">Active</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <Users className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-medium">Sarah Chen</div>
                                <div className="text-sm text-muted-foreground">Working on auth service</div>
                              </div>
                              <Badge variant="outline" className="ml-auto">Online</Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                <Code className="w-4 h-4 text-green-600" />
                              </div>
                              <div>
                                <div className="font-medium">Mike Rodriguez</div>
                                <div className="text-sm text-muted-foreground">Reviewing PR #142</div>
                              </div>
                              <Badge variant="outline" className="ml-auto">Away</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Shared Workflows:</div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">Deployment Pipeline</Badge>
                              <Badge variant="outline">Code Review</Badge>
                              <Badge variant="outline">Testing</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "integration-marketplace" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Integration Marketplace</h5>
                          <Badge variant="default">Available</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Database className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium">PostgreSQL Connector</div>
                                  <div className="text-sm text-muted-foreground">Database integration</div>
                                </div>
                              </div>
                              <Badge variant="default">Installed</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                  <Zap className="w-4 h-4 text-green-600" />
                                </div>
                                <div>
                                  <div className="font-medium">Slack Notifications</div>
                                  <div className="text-sm text-muted-foreground">Alert integration</div>
                                </div>
                              </div>
                              <Button size="sm" variant="outline">Install</Button>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Popular Integrations:</div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">JIRA</Badge>
                              <Badge variant="outline">GitHub</Badge>
                              <Badge variant="outline">AWS</Badge>
                              <Badge variant="outline">Docker</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeDemo === "mobile-app" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold">Mobile Dashboard</h5>
                          <Badge variant="default">Connected</Badge>
                        </div>
                        <div className="bg-white rounded p-4 shadow">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">System Status</span>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-sm text-green-600">All Systems Operational</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Active Alerts</span>
                              <Badge variant="secondary">2</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Last Sync</span>
                              <span className="text-sm text-muted-foreground">2 minutes ago</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-muted rounded p-3">
                          <div className="text-sm">
                            <div className="font-medium mb-1">Mobile Features:</div>
                            <div className="space-y-1">
                              <div className="text-xs">• Push notifications for critical alerts</div>
                              <div className="text-xs">• Offline mode with cached data</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!["real-time-monitoring", "ai-model-performance", "predictive-analytics", "code-quality-gates", "intelligent-ticketing-system", "agent-workflow-builder", "code-graph-ui", "context-graph", "custom-dashboard-builder", "security-compliance-center", "test-intelligence", "resource-optimization", "collaboration-hub", "integration-marketplace", "mobile-app"].includes(activeDemo) && (
                      <div className="space-y-2">
                        <div className="h-4 bg-primary/20 rounded animate-pulse" />
                        <div className="h-4 bg-primary/20 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-primary/20 rounded animate-pulse w-1/2" />
                      </div>
                    )}
                    
                    <div className="mt-4 text-sm text-muted-foreground">
                      {demoProgress < 25 && "Initializing demo..."}
                      {demoProgress >= 25 && demoProgress < 50 && "Loading data..."}
                      {demoProgress >= 50 && demoProgress < 75 && "Processing..."}
                      {demoProgress >= 75 && demoProgress < 100 && "Finalizing..."}
                      {demoProgress >= 100 && "Demo complete!"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Progress: {demoProgress}%
                  </div>
                  <Progress value={demoProgress} className="w-32" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={stopDemo}>
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                  <Button variant="outline" size="sm" onClick={stopDemo}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Stop Demo
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search features..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFeatures.map((feature) => (
          <Card key={feature.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <Badge 
                      className={`text-white ${getStatusColor(feature.status)}`}
                      variant="default"
                    >
                      {getStatusText(feature.status)}
                    </Badge>
                  </div>
                </div>
              </div>
              <CardDescription className="mt-2">
                {feature.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Category: {feature.category}</span>
                  <span>Status: {getStatusText(feature.status)}</span>
                </div>

                {feature.status === "available" && (
                  <div className="space-y-2">
                    <Button 
                      className="w-full" 
                      onClick={() => startDemo(feature.id)}
                      disabled={activeDemo === feature.id}
                    >
                      {activeDemo === feature.id ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Running Demo...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Try Demo
                        </>
                      )}
                    </Button>
                    
                    {activeDemo === feature.id && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Demo Progress</span>
                          <span>{demoProgress}%</span>
                        </div>
                        <Progress value={demoProgress} className="w-full" />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={stopDemo}
                          className="w-full"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Stop Demo
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {feature.status === "beta" && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      This feature is in beta. Some functionality may be limited.
                    </AlertDescription>
                  </Alert>
                )}

                {feature.status === "coming-soon" && (
                  <div className="text-center py-4">
                    <div className="text-sm text-muted-foreground mb-2">
                      Expected: Q1 2025
                    </div>
                    <Button variant="outline" disabled className="w-full">
                      <Clock className="w-4 h-4 mr-2" />
                      Coming Soon
                    </Button>
                  </div>
                )}

                {feature.status === "planned" && (
                  <div className="text-center py-4">
                    <div className="text-sm text-muted-foreground mb-2">
                      In planning phase
                    </div>
                    <Button variant="outline" disabled className="w-full">
                      <Settings className="w-4 h-4 mr-2" />
                      Planned
                    </Button>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full">
                    Learn More
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>


      {/* Feature Roadmap */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Roadmap</CardTitle>
          <CardDescription>
            Timeline of upcoming features and improvements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div>
                <div className="font-medium">Q4 2024 - Current</div>
                <div className="text-sm text-muted-foreground">
                  AI Model Performance, Custom Dashboard Builder, Real-time monitoring
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div>
                <div className="font-medium">Q1 2025 - Beta</div>
                <div className="text-sm text-muted-foreground">
                  Predictive Analytics Engine, Code Quality Gates, Resource Optimization Engine
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <div>
                <div className="font-medium">Q2 2025 - Coming Soon</div>
                <div className="text-sm text-muted-foreground">
                  Security & Compliance Center, Test Intelligence System
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              <div>
                <div className="font-medium">Q3 2025 - Planned</div>
                <div className="text-sm text-muted-foreground">
                  Agent Workflow Builder, Code Graph UI, Context Graph, Collaboration Hub, Integration Marketplace, Mobile App
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle>Share Your Feedback</CardTitle>
          <CardDescription>
            Help us prioritize features and improve the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-20 flex flex-col gap-2">
              <Star className="w-5 h-5" />
              <span>Rate Features</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-2">
              <Bell className="w-5 h-5" />
              <span>Get Updates</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col gap-2">
              <ExternalLink className="w-5 h-5" />
              <span>Request Feature</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

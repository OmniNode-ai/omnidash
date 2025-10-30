import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Wand2, 
  CheckCircle, 
  AlertTriangle, 
  Copy, 
  Download, 
  Upload,
  RefreshCw,
  Eye,
  Settings,
  Code,
  Database,
  Zap,
  BarChart3,
  Save,
  Loader2,
  Sparkles,
  FileCode,
  Shield,
  Clock
} from "lucide-react";

// Mock contract schemas based on omnibase_core models
const CONTRACT_TYPES = {
  workflow: {
    name: "Workflow (Orchestrator)",
    description: "Orchestrator workflow for coordinating multiple operations",
    icon: BarChart3,
    schema: {
      node_identity: {
        name: { type: "string", required: true, description: "Unique contract name" },
        display_name: { type: "string", required: true, description: "Human-readable name" },
        node_type: { type: "enum", values: ["orchestrator"], required: true },
        version: { type: "string", required: true, description: "Semantic version" },
        description: { type: "string", required: true, description: "Contract description" }
      },
      metadata: {
        author: { type: "string", required: false, description: "Contract author" },
        created_date: { type: "date", required: false, description: "Creation date" },
        tags: { type: "array", required: false, description: "Classification tags" }
      },
      performance_requirements: {
        execution_time: {
          target_ms: { type: "number", required: true, description: "Target execution time" },
          max_ms: { type: "number", required: true, description: "Maximum execution time" }
        },
        throughput: {
          target_workflows_per_minute: { type: "number", required: false, description: "Target throughput" }
        }
      },
      workflow_stages: {
        type: "array",
        item_schema: {
          stage_number: { type: "number", required: true },
          stage_name: { type: "string", required: true },
          description: { type: "string", required: true },
          target_duration_ms: { type: "number", required: true },
          dependencies: { type: "array", required: false },
          output_artifacts: { type: "array", required: false }
        }
      }
    }
  },
  effect: {
    name: "Effect",
    description: "Side-effect node for I/O operations and external integrations",
    icon: Zap,
    schema: {
      node_identity: {
        name: { type: "string", required: true, description: "Unique contract name" },
        display_name: { type: "string", required: true, description: "Human-readable name" },
        node_type: { type: "enum", values: ["effect"], required: true },
        version: { type: "string", required: true, description: "Semantic version" },
        description: { type: "string", required: true, description: "Contract description" }
      },
      io_operations: {
        type: "array",
        item_schema: {
          name: { type: "string", required: true, description: "Operation name" },
          description: { type: "string", required: true, description: "Operation description" },
          target_ms: { type: "number", required: true, description: "Target duration" },
          input_model: { type: "string", required: true, description: "Input model class" },
          output_model: { type: "string", required: true, description: "Output model class" },
          side_effects: { type: "array", required: false, description: "Side effects list" }
        }
      },
      transaction_management: {
        enabled: { type: "boolean", required: false, description: "Enable transactions" },
        isolation_level: { type: "enum", values: ["read_committed", "repeatable_read", "serializable"], required: false }
      }
    }
  },
  reducer: {
    name: "Reducer",
    description: "Streaming aggregation and data processing node",
    icon: Database,
    schema: {
      node_identity: {
        name: { type: "string", required: true, description: "Unique contract name" },
        display_name: { type: "string", required: true, description: "Human-readable name" },
        node_type: { type: "enum", values: ["reducer"], required: true },
        version: { type: "string", required: true, description: "Semantic version" },
        description: { type: "string", required: true, description: "Contract description" }
      },
      aggregation_strategy: {
        type: { type: "enum", values: ["streaming", "batch"], required: true, description: "Aggregation type" },
        window_types: {
          type: "array",
          item_schema: {
            name: { type: "string", required: true, description: "Window name" },
            duration_seconds: { type: "number", required: true, description: "Window duration" }
          }
        }
      },
      input_state: {
        type: { type: "enum", values: ["stream"], required: true, description: "Input type" },
        event_types: { type: "array", required: true, description: "Supported event types" }
      }
    }
  }
};

// Mock examples from omninode_bridge contracts
const EXAMPLE_CONTRACTS = {
  workflow: {
    name: "codegen_workflow",
    display_name: "Code Generation Workflow",
    description: "Orchestrator workflow for 6-stage ONEX node generation pipeline",
    yaml: `# ONEX v2.0 Contract - Code Generation Workflow
schema_version: "2.0"
contract_version: "1.0.0"

node_identity:
  name: "codegen_workflow"
  display_name: "Code Generation Workflow"
  node_type: "orchestrator"
  version: "1.0.0"
  description: |
    Orchestrator workflow for ONEX node code generation using 6-stage pipeline.

metadata:
  author: "OmniNode Team"
  created_date: "2025-10-24"
  tags:
    - "workflow-orchestration"
    - "code-generation"
    - "llama-index"

performance_requirements:
  execution_time:
    target_ms: 53000
    max_ms: 120000
  throughput:
    target_workflows_per_minute: 2

workflow_stages:
  - stage_number: 1
    stage_name: "contract_generation"
    description: "Generate ONEX v2.0 contract YAML"
    target_duration_ms: 8000
    dependencies: []
    output_artifacts:
      - "contract.yaml"

  - stage_number: 2
    stage_name: "model_generation"
    description: "Generate Pydantic v2 data models"
    target_duration_ms: 6000
    dependencies: ["contract_generation"]
    output_artifacts:
      - "models/*.py"`
  },
  effect: {
    name: "deployment_sender_effect",
    display_name: "Deployment Sender Effect",
    description: "Effect node for Docker container packaging and remote deployment operations",
    yaml: `# ONEX v2.0 Contract - Deployment Sender Effect
schema_version: "2.0"
contract_version: "1.0.0"

node_identity:
  name: "deployment_sender_effect"
  display_name: "Deployment Sender Effect"
  node_type: "effect"
  version: "1.0.0"
  description: |
    Effect node for Docker container deployment operations.

io_operations:
  - name: "package_container"
    description: "Build Docker image and create deployment package"
    target_ms: 15000
    input_model: "ModelContainerPackageInput"
    output_model: "ModelContainerPackageOutput"
    side_effects:
      - "docker_image_build"
      - "filesystem_write"

  - name: "transfer_package"
    description: "Send deployment package to remote receiver"
    target_ms: 8000
    input_model: "ModelPackageTransferInput"
    output_model: "ModelPackageTransferOutput"
    side_effects:
      - "network_io"
      - "http_request"

transaction_management:
  enabled: true
  isolation_level: "read_committed"`
  },
  reducer: {
    name: "codegen_metrics",
    display_name: "Code Generation Metrics Reducer",
    description: "Reducer node for streaming aggregation of code generation metrics",
    yaml: `# ONEX v2.0 Contract - Code Generation Metrics Reducer
schema_version: "2.0"
contract_version: "1.0.0"

node_identity:
  name: "codegen_metrics"
  display_name: "Code Generation Metrics Reducer"
  node_type: "reducer"
  version: "1.0.0"
  description: |
    Reducer node for streaming aggregation of code generation metrics.

aggregation_strategy:
  type: "streaming"
  window_types:
    - name: "hourly"
      duration_seconds: 3600
    - name: "daily"
      duration_seconds: 86400

input_state:
  type: "stream"
  event_types:
    - "NODE_GENERATION_STARTED"
    - "NODE_GENERATION_COMPLETED"
    - "NODE_GENERATION_FAILED"`
  }
};

export default function ContractBuilder() {
  const [selectedType, setSelectedType] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [generatedContract, setGeneratedContract] = useState<any>(null);
  const [yamlOutput, setYamlOutput] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"prompt" | "form" | "yaml" | "validation" | "history" | "suggestions">("prompt");
  const [formData, setFormData] = useState<any>({});
  const [contractHistory, setContractHistory] = useState<any[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Generate AI suggestions based on contract type
  const generateSuggestions = () => {
    const suggestions = {
      workflow: [
        "Create a data processing workflow with validation, transformation, and storage stages",
        "Build a microservice orchestration workflow with error handling and retries",
        "Design a CI/CD pipeline workflow with automated testing and deployment"
      ],
      effect: [
        "Create a database write effect with transaction management",
        "Build an API integration effect with rate limiting and error handling",
        "Design a file processing effect with validation and backup"
      ],
      reducer: [
        "Create a metrics aggregation reducer for real-time analytics",
        "Build a log processing reducer with filtering and alerting",
        "Design a data transformation reducer with streaming capabilities"
      ]
    };
    setAiSuggestions(suggestions[selectedType as keyof typeof suggestions] || []);
  };

  // Save contract to history
  const saveToHistory = (contract: any, yaml: string) => {
    const historyItem = {
      id: Date.now(),
      type: selectedType,
      prompt: aiPrompt,
      contract,
      yaml,
      timestamp: new Date().toISOString()
    };
    setContractHistory(prev => [historyItem, ...prev.slice(0, 9)]); // Keep last 10
  };

  // Load contract from history
  const loadFromHistory = (index: number) => {
    const item = contractHistory[index];
    if (item) {
      setSelectedType(item.type);
      setAiPrompt(item.prompt);
      setGeneratedContract(item.contract);
      setYamlOutput(item.yaml);
      setFormData(item.contract);
      setActiveTab("yaml");
    }
  };

  // Generate contract from AI prompt
  const generateContract = async () => {
    if (!selectedType || !aiPrompt.trim()) return;
    
    setIsGenerating(true);
    
    // Simulate AI generation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock AI generation based on prompt and type
    const mockContract = generateMockContract(selectedType, aiPrompt);
    setGeneratedContract(mockContract);
    setFormData(mockContract);
    setYamlOutput(convertToYaml(mockContract));
    setActiveTab("form");
    setIsGenerating(false);
    
    // Save to history
    saveToHistory(mockContract, convertToYaml(mockContract));
  };

  // Load example contract
  const loadExample = (type: string) => {
    const example = EXAMPLE_CONTRACTS[type as keyof typeof EXAMPLE_CONTRACTS];
    if (example) {
      setGeneratedContract(example);
      setFormData(example);
      setYamlOutput(example.yaml);
      setActiveTab("yaml");
    }
  };

  // Generate mock contract based on type and prompt
  const generateMockContract = (type: string, prompt: string) => {
    const baseContract = {
      node_identity: {
        name: prompt.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + type,
        display_name: prompt.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        node_type: type,
        version: "1.0.0",
        description: prompt
      },
      metadata: {
        author: "AI Generated",
        created_date: new Date().toISOString().split('T')[0],
        tags: [type, "ai-generated"]
      }
    };

    // Add type-specific fields
    if (type === 'workflow') {
      return {
        ...baseContract,
        performance_requirements: {
          execution_time: { target_ms: 30000, max_ms: 60000 },
          throughput: { target_workflows_per_minute: 5 }
        },
        workflow_stages: [
          {
            stage_number: 1,
            stage_name: "initialization",
            description: "Initialize workflow",
            target_duration_ms: 5000,
            dependencies: [],
            output_artifacts: ["init.log"]
          },
          {
            stage_number: 2,
            stage_name: "processing",
            description: "Main processing stage",
            target_duration_ms: 20000,
            dependencies: ["initialization"],
            output_artifacts: ["result.json"]
          }
        ]
      };
    } else if (type === 'effect') {
      return {
        ...baseContract,
        io_operations: [
          {
            name: "main_operation",
            description: "Primary I/O operation",
            target_ms: 10000,
            input_model: "ModelInput",
            output_model: "ModelOutput",
            side_effects: ["filesystem_write", "network_io"]
          }
        ],
        transaction_management: {
          enabled: true,
          isolation_level: "read_committed"
        }
      };
    } else if (type === 'reducer') {
      return {
        ...baseContract,
        aggregation_strategy: {
          type: "streaming",
          window_types: [
            { name: "minute", duration_seconds: 60 },
            { name: "hourly", duration_seconds: 3600 }
          ]
        },
        input_state: {
          type: "stream",
          event_types: ["EVENT_STARTED", "EVENT_COMPLETED"]
        }
      };
    }

    return baseContract;
  };

  // Convert contract to YAML
  const convertToYaml = (contract: any) => {
    const yamlLines = ["# ONEX v2.0 Contract - AI Generated"];
    yamlLines.push(`schema_version: "2.0"`);
    yamlLines.push(`contract_version: "1.0.0"`);
    yamlLines.push("");
    
    // Convert nested object to YAML
    const convertObject = (obj: any, indent = 0) => {
      const spaces = "  ".repeat(indent);
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          yamlLines.push(`${spaces}${key}:`);
          value.forEach(item => {
            if (typeof item === 'object') {
              yamlLines.push(`${spaces}  - ${Object.keys(item)[0]}: ${Object.values(item)[0]}`);
            } else {
              yamlLines.push(`${spaces}  - ${item}`);
            }
          });
        } else if (typeof value === 'object' && value !== null) {
          yamlLines.push(`${spaces}${key}:`);
          convertObject(value, indent + 1);
        } else {
          const yamlValue = typeof value === 'string' && value.includes('\n') ? `|\n${spaces}  ${value}` : value;
          yamlLines.push(`${spaces}${key}: ${yamlValue}`);
        }
      }
    };
    
    convertObject(contract);
    return yamlLines.join('\n');
  };

  // Validate contract
  const validateContract = () => {
    const errors: string[] = [];
    
    if (!formData.node_identity?.name) {
      errors.push("Contract name is required");
    }
    if (!formData.node_identity?.description) {
      errors.push("Contract description is required");
    }
    if (!formData.node_identity?.version) {
      errors.push("Contract version is required");
    }
    
    // Type-specific validation
    if (selectedType === 'workflow' && !formData.workflow_stages?.length) {
      errors.push("Workflow must have at least one stage");
    }
    if (selectedType === 'effect' && !formData.io_operations?.length) {
      errors.push("Effect must have at least one I/O operation");
    }
    if (selectedType === 'reducer' && !formData.aggregation_strategy) {
      errors.push("Reducer must have aggregation strategy");
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Update form data
  const updateFormData = (path: string, value: any) => {
    const keys = path.split('.');
    const newData = { ...formData };
    let current = newData;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    setFormData(newData);
    setYamlOutput(convertToYaml(newData));
  };

  // Render form field based on schema
  const renderFormField = (key: string, field: any, path: string) => {
    const value = getNestedValue(formData, path) || '';
    
    if (field.type === 'enum') {
      return (
        <div key={path} className="space-y-2">
          <Label htmlFor={path}>{key}</Label>
          <Select value={value} onValueChange={(val) => updateFormData(path, val)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${key}`} />
            </SelectTrigger>
            <SelectContent>
              {field.values.map((val: string) => (
                <SelectItem key={val} value={val}>{val}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      );
    }
    
    if (field.type === 'boolean') {
      return (
        <div key={path} className="space-y-2">
          <Label htmlFor={path}>{key}</Label>
          <Select value={value.toString()} onValueChange={(val) => updateFormData(path, val === 'true')}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${key}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">True</SelectItem>
              <SelectItem value="false">False</SelectItem>
            </SelectContent>
          </Select>
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      );
    }
    
    if (field.type === 'array') {
      return (
        <div key={path} className="space-y-2">
          <Label htmlFor={path}>{key}</Label>
          <Textarea
            value={Array.isArray(value) ? value.join('\n') : ''}
            onChange={(e) => updateFormData(path, e.target.value.split('\n').filter(Boolean))}
            placeholder={`Enter ${key} (one per line)`}
          />
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      );
    }
    
    if (field.type === 'number') {
      return (
        <div key={path} className="space-y-2">
          <Label htmlFor={path}>{key}</Label>
          <Input
            type="number"
            value={value}
            onChange={(e) => updateFormData(path, Number(e.target.value))}
            placeholder={`Enter ${key}`}
          />
          {field.description && (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          )}
        </div>
      );
    }
    
    return (
      <div key={path} className="space-y-2">
        <Label htmlFor={path}>{key}</Label>
        <Input
          value={value}
          onChange={(e) => updateFormData(path, e.target.value)}
          placeholder={`Enter ${key}`}
        />
        {field.description && (
          <p className="text-sm text-muted-foreground">{field.description}</p>
        )}
      </div>
    );
  };

  // Get nested value from object
  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Render form from schema
  const renderForm = () => {
    if (!selectedType || !CONTRACT_TYPES[selectedType as keyof typeof CONTRACT_TYPES]) {
      return <div>Please select a contract type first</div>;
    }
    
    const schema = CONTRACT_TYPES[selectedType as keyof typeof CONTRACT_TYPES].schema;
    const sections = Object.entries(schema);
    
    return (
      <div className="space-y-6">
        {sections.map(([sectionName, sectionSchema]) => (
          <Card key={sectionName}>
            <CardHeader>
              <CardTitle className="text-lg capitalize">{sectionName.replace('_', ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(sectionSchema).map(([key, field]) => {
                if (typeof field === 'object' && field.type === 'array' && field.item_schema) {
                  // Handle array of objects
                  return (
                    <div key={`${sectionName}.${key}`} className="space-y-2">
                      <Label>{key}</Label>
                      <div className="space-y-2 p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground">Array items will be added here</p>
                        <Button variant="outline" size="sm">
                          Add {key.slice(0, -1)}
                        </Button>
                      </div>
                    </div>
                  );
                }
                
                if (typeof field === 'object' && field.type) {
                  return renderFormField(key, field, `${sectionName}.${key}`);
                }
                
                return null;
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Contract Builder
          </h1>
          <p className="text-muted-foreground mt-2">
            AI-powered ONEX v2.0 contract generation with structured editing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setActiveTab("prompt")}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Contract
          </Button>
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Contract Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Contract Type</CardTitle>
          <CardDescription>Select the type of ONEX contract to generate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(CONTRACT_TYPES).map(([key, type]) => {
              const Icon = type.icon;
              return (
                <Card 
                  key={key}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedType === key ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedType(key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Icon className="w-8 h-8 text-primary" />
                      <div>
                        <h3 className="font-semibold">{type.name}</h3>
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button 
            variant={activeTab === "prompt" ? "default" : "outline"} 
            onClick={() => setActiveTab("prompt")}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            AI Prompt
          </Button>
          <Button 
            variant={activeTab === "form" ? "default" : "outline"} 
            onClick={() => setActiveTab("form")}
            disabled={!generatedContract}
          >
            <Settings className="w-4 h-4 mr-2" />
            Form Editor
          </Button>
          <Button 
            variant={activeTab === "yaml" ? "default" : "outline"} 
            onClick={() => setActiveTab("yaml")}
            disabled={!yamlOutput}
          >
            <FileCode className="w-4 h-4 mr-2" />
            YAML Preview
          </Button>
          <Button 
            variant={activeTab === "validation" ? "default" : "outline"} 
            onClick={() => setActiveTab("validation")}
            disabled={!generatedContract}
          >
            <Shield className="w-4 h-4 mr-2" />
            Validation
          </Button>
          <Button 
            variant={activeTab === "history" ? "default" : "outline"} 
            onClick={() => setActiveTab("history")}
          >
            <Clock className="w-4 h-4 mr-2" />
            History
          </Button>
          <Button 
            variant={activeTab === "suggestions" ? "default" : "outline"} 
            onClick={() => {
              setActiveTab("suggestions");
              generateSuggestions();
            }}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Suggestions
          </Button>
        </div>

        {/* AI Prompt Tab */}
        {activeTab === "prompt" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                AI Contract Generation
              </CardTitle>
              <CardDescription>
                Describe your contract requirements and let AI generate the initial structure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-prompt">Contract Description</Label>
                <Textarea
                  id="ai-prompt"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe your contract requirements... (e.g., 'Create a workflow that processes user data through validation, transformation, and storage stages')"
                  className="min-h-[120px]"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={generateContract}
                  disabled={!selectedType || !aiPrompt.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  {isGenerating ? "Generating..." : "Generate Contract"}
                </Button>
                
                {selectedType && (
                  <Button 
                    variant="outline" 
                    onClick={() => loadExample(selectedType)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Load Example
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form Editor Tab */}
        {activeTab === "form" && generatedContract && (
          <div className="space-y-4">
            {renderForm()}
          </div>
        )}

        {/* YAML Preview Tab */}
        {activeTab === "yaml" && yamlOutput && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                YAML Preview
              </CardTitle>
              <CardDescription>
                Generated ONEX v2.0 contract in YAML format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                  <code>{yamlOutput}</code>
                </pre>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="absolute top-2 right-2"
                  onClick={() => navigator.clipboard.writeText(yamlOutput)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validation Tab */}
        {activeTab === "validation" && generatedContract && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Contract Validation
              </CardTitle>
              <CardDescription>
                Validate contract compliance with ONEX v2.0 standards
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={validateContract}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Validate Contract
                </Button>
              </div>
              
              {validationErrors.length > 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">Validation Errors:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {validationErrors.map((error, index) => (
                          <li key={index} className="text-sm">{error}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Contract validation passed! All required fields are present and valid.
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Compliance Hints */}
              <div className="space-y-2">
                <h4 className="font-semibold">Compliance Hints</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Schema version 2.0 specified</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Node identity properly defined</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span>Consider adding performance requirements</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span>Consider adding error handling configuration</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Contract History
              </CardTitle>
              <CardDescription>
                View and load previously generated contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contractHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No contracts in history yet</p>
                  <p className="text-sm">Generate your first contract to see it here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contractHistory.map((contract, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{contract.type} Contract</h4>
                          <p className="text-sm text-muted-foreground">
                            {new Date(contract.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadFromHistory(index)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Load
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const yaml = yaml.dump(contract.contract, { indent: 2 });
                              navigator.clipboard.writeText(yaml);
                            }}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy YAML
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p><strong>Description:</strong> {contract.description}</p>
                        <p><strong>Status:</strong> {contract.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Suggestions Tab */}
        {activeTab === "suggestions" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="w-5 h-5 mr-2" />
                AI Suggestions
              </CardTitle>
              <CardDescription>
                Get AI-powered suggestions for improving your contract
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiSuggestions.map((suggestion, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium">{suggestion.title}</h4>
                        <Badge variant={suggestion.priority === "high" ? "destructive" : suggestion.priority === "medium" ? "default" : "secondary"}>
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUserPrompt(suggestion.prompt);
                            setActiveTab("prompt");
                          }}
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Use Prompt
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const yaml = yaml.dump(suggestion.example, { indent: 2 });
                            navigator.clipboard.writeText(yaml);
                          }}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Example
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="pt-4 border-t">
                  <Button
                    onClick={generateSuggestions}
                    className="w-full"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate New Suggestions
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

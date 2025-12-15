import { memo, useCallback, useState, useRef } from 'react';
import { ChevronRight, ChevronLeft, X, Maximize2, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getNodeTypeDefinition } from './models/nodeRegistry';
import type { WorkflowNode, Connection, ConfigField } from './models/types';

interface InspectorPanelProps {
  selectedNodes: WorkflowNode[];
  selectedConnection: Connection | null;
  nodes: WorkflowNode[]; // For looking up connection endpoints
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNodes: (nodeIds: string[]) => void;
  onDeleteConnection: (connectionId: string) => void;
}

interface FieldRendererProps {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}

// Generic field renderer that handles all field types
const FieldRenderer = memo(function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  switch (field.type) {
    case 'string':
      return (
        <Input
          value={(value as string) ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={(value as number) ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      );

    case 'boolean':
      return (
        <Switch checked={(value as boolean) ?? field.default ?? false} onCheckedChange={onChange} />
      );

    case 'select':
      return (
        <Select value={(value as string) ?? field.default ?? ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multiline':
      return (
        <Textarea
          value={(value as string) ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 3}
        />
      );

    case 'json': {
      const stringValue =
        value !== undefined
          ? JSON.stringify(value, null, 2)
          : JSON.stringify(field.default ?? {}, null, 2);

      return (
        <div className="space-y-1">
          <Textarea
            value={stringValue}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setJsonError(null);
                onChange(parsed);
              } catch {
                setJsonError('Invalid JSON');
              }
            }}
            className="font-mono text-xs"
            rows={field.rows ?? 4}
          />
          {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        </div>
      );
    }

    default:
      return <div className="text-xs text-muted-foreground">Unknown field type</div>;
  }
});

// Node inspector content for single node
const NodeInspector = memo(function NodeInspector({
  node,
  onUpdateData,
}: {
  node: WorkflowNode;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const schemaContainerRef = useRef<HTMLDivElement>(null);
  const typeDef = getNodeTypeDefinition(node.type);

  const handleCopySchema = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(typeDef, null, 2));
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy schema:', err);
    }
  }, [typeDef]);

  const handleSchemaKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+A or Cmd+A to select all schema content
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      if (schemaContainerRef.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(schemaContainerRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, []);
  const configFields = typeDef?.configFields ?? [];

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      onUpdateData({
        ...node.data,
        [fieldName]: value,
      });
    },
    [node.data, onUpdateData]
  );

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Node header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: typeDef?.color ?? '#6b7280' }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{typeDef?.label ?? 'Unknown'}</div>
          <div className="text-xs text-muted-foreground truncate">{node.id}</div>
        </div>
      </div>

      {/* Description */}
      {typeDef?.description && (
        <p className="text-xs text-muted-foreground flex-shrink-0">{typeDef.description}</p>
      )}

      {/* Tabs for Config and Schema */}
      <Tabs defaultValue="config" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="schema">Schema</TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config" className="mt-3 flex-1 overflow-auto">
          {configFields.length > 0 ? (
            <div className="space-y-3">
              {configFields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    {field.label}
                    {field.required && <span className="text-destructive">*</span>}
                  </Label>
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                  <FieldRenderer
                    field={field}
                    value={node.data[field.name]}
                    onChange={(value) => handleFieldChange(field.name, value)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No configurable fields</p>
          )}
        </TabsContent>

        {/* Schema Tab */}
        <TabsContent value="schema" className="mt-3 flex-1 flex flex-col min-h-0">
          <div
            ref={schemaContainerRef}
            tabIndex={0}
            onKeyDown={handleSchemaKeyDown}
            className="relative rounded overflow-auto flex-1 min-h-32 group focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {/* Floating action buttons - top-left, show on hover */}
            <div className="absolute top-1 left-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopySchema}
                className="p-1 rounded bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors"
                aria-label={schemaCopied ? 'Copied' : 'Copy schema'}
                title={schemaCopied ? 'Copied!' : 'Copy to clipboard'}
              >
                {schemaCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setSchemaModalOpen(true)}
                className="p-1 rounded bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-colors"
                aria-label="Expand schema"
                title="View full schema"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
            <SyntaxHighlighter
              language="json"
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: '0.5rem',
                fontSize: '0.75rem',
                borderRadius: '0.375rem',
              }}
            >
              {JSON.stringify(typeDef, null, 2)}
            </SyntaxHighlighter>
          </div>

          {/* Schema Modal */}
          <Dialog open={schemaModalOpen} onOpenChange={setSchemaModalOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <div className="flex items-center justify-between pr-8">
                  <DialogTitle className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: typeDef?.color ?? '#6b7280' }}
                    />
                    {typeDef?.label ?? 'Unknown'} Schema
                  </DialogTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopySchema}
                    className="h-7 text-xs"
                  >
                    {schemaCopied ? (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-auto">
                <SyntaxHighlighter
                  language="json"
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.8125rem',
                    borderRadius: '0.375rem',
                  }}
                >
                  {JSON.stringify(typeDef, null, 2)}
                </SyntaxHighlighter>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
});

// Multi-node inspector for multiple selected nodes
const MultiNodeInspector = memo(function MultiNodeInspector({ nodes }: { nodes: WorkflowNode[] }) {
  // Group nodes by type for display
  const typeCounts = nodes.reduce(
    (acc, node) => {
      const typeDef = getNodeTypeDefinition(node.type);
      const label = typeDef?.label ?? 'Unknown';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="font-semibold text-sm">{nodes.length} nodes selected</div>

      {/* Node type breakdown */}
      <div className="space-y-1">
        {Object.entries(typeCounts).map(([label, count]) => (
          <div
            key={label}
            className="flex items-center justify-between text-xs text-muted-foreground"
          >
            <span>{label}</span>
            <span>{count}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground">Ctrl+click to toggle individual nodes</p>
    </div>
  );
});

// Connection inspector content
const ConnectionInspector = memo(function ConnectionInspector({
  connection,
  nodes,
}: {
  connection: Connection;
  nodes: WorkflowNode[];
}) {
  const fromNode = nodes.find((n) => n.id === connection.fromNodeId);
  const toNode = nodes.find((n) => n.id === connection.toNodeId);
  const fromPort = fromNode?.outputPorts.find((p) => p.id === connection.fromPortId);
  const toPort = toNode?.inputPorts.find((p) => p.id === connection.toPortId);

  const fromTypeDef = fromNode ? getNodeTypeDefinition(fromNode.type) : null;
  const toTypeDef = toNode ? getNodeTypeDefinition(toNode.type) : null;

  return (
    <div className="space-y-4">
      <div className="font-semibold text-sm">Connection</div>

      {/* From */}
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: fromTypeDef?.color ?? '#6b7280' }}
          />
          <span className="text-sm">{fromTypeDef?.label ?? 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">: {fromPort?.name ?? '?'}</span>
        </div>
      </div>

      {/* To */}
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: toTypeDef?.color ?? '#6b7280' }}
          />
          <span className="text-sm">{toTypeDef?.label ?? 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">: {toPort?.name ?? '?'}</span>
        </div>
      </div>
    </div>
  );
});

// Empty state when nothing is selected
const EmptyState = memo(function EmptyState() {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-muted-foreground">Select a node or connection to inspect</p>
    </div>
  );
});

export const InspectorPanel = memo(function InspectorPanel({
  selectedNodes,
  selectedConnection,
  nodes,
  onUpdateNodeData,
  onDeleteNodes,
  onDeleteConnection,
}: InspectorPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleUpdateData = useCallback(
    (data: Record<string, unknown>) => {
      if (selectedNodes.length === 1) {
        onUpdateNodeData(selectedNodes[0].id, data);
      }
    },
    [selectedNodes, onUpdateNodeData]
  );

  const handleDeleteNodes = useCallback(() => {
    if (selectedNodes.length > 0) {
      onDeleteNodes(selectedNodes.map((n) => n.id));
    }
  }, [selectedNodes, onDeleteNodes]);

  const handleDeleteConnection = useCallback(() => {
    if (selectedConnection) {
      onDeleteConnection(selectedConnection.id);
    }
  }, [selectedConnection, onDeleteConnection]);

  // Determine what to show
  const renderContent = () => {
    if (selectedNodes.length === 1) {
      return <NodeInspector node={selectedNodes[0]} onUpdateData={handleUpdateData} />;
    }

    if (selectedNodes.length > 1) {
      return <MultiNodeInspector nodes={selectedNodes} />;
    }

    if (selectedConnection) {
      return <ConnectionInspector connection={selectedConnection} nodes={nodes} />;
    }

    return <EmptyState />;
  };

  // Determine delete action and label
  const getDeleteAction = () => {
    if (selectedNodes.length === 1) {
      return { action: handleDeleteNodes, label: 'Delete Node' };
    }
    if (selectedNodes.length > 1) {
      return { action: handleDeleteNodes, label: `Delete ${selectedNodes.length} Nodes` };
    }
    if (selectedConnection) {
      return { action: handleDeleteConnection, label: 'Delete Connection' };
    }
    return null;
  };

  const deleteInfo = getDeleteAction();

  if (!isOpen) {
    // Collapsed state: compact icon button
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-8 h-8 flex items-center justify-center bg-card border rounded hover:bg-muted/50 transition-colors"
        aria-label="Open inspector"
        title="Inspector"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    );
  }

  // Open state: full panel with toggle in header
  return (
    <div className="w-64 h-full flex flex-col bg-card border-l">
      {/* Header with toggle */}
      <div className="p-3 border-b flex-shrink-0 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Inspector</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          aria-label="Collapse inspector"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">{renderContent()}</div>

      {/* Delete button - always at bottom */}
      {deleteInfo && (
        <div className="p-3 border-t flex-shrink-0">
          <Button variant="destructive" size="sm" className="w-full" onClick={deleteInfo.action}>
            <X className="w-4 h-4 mr-1" />
            {deleteInfo.label}
          </Button>
        </div>
      )}
    </div>
  );
});

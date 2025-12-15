import { memo, useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronLeft, X, Maximize2, Copy, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { getNodeTypeDefinition, validateNodeData } from './models/nodeRegistry';
import type { FieldValidationError } from './models/nodeRegistry';
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
  error?: string;
}

// Helper for error styling
const errorInputClass = 'border-destructive focus-visible:ring-destructive';

// Generic field renderer that handles all field types
const FieldRenderer = memo(function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: FieldRendererProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Combined error message (validation error or JSON parse error)
  const displayError = error || jsonError;

  switch (field.type) {
    case 'string':
      return (
        <div className="space-y-1">
          <Input
            value={(value as string) ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={error ? errorInputClass : ''}
          />
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1">
          <Input
            type="number"
            value={(value as number) ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            min={field.min}
            max={field.max}
            step={field.step}
            className={error ? errorInputClass : ''}
          />
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
        </div>
      );

    case 'boolean':
      return (
        <div className="space-y-1">
          <Switch
            checked={(value as boolean) ?? field.default ?? false}
            onCheckedChange={onChange}
          />
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1">
          <Select value={(value as string) ?? field.default ?? ''} onValueChange={onChange}>
            <SelectTrigger className={error ? errorInputClass : ''}>
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
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
        </div>
      );

    case 'multiline':
      return (
        <div className="space-y-1">
          <Textarea
            value={(value as string) ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows ?? 3}
            className={error ? errorInputClass : ''}
          />
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
        </div>
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
            className={`font-mono text-xs ${error || jsonError ? errorInputClass : ''}`}
            rows={field.rows ?? 4}
          />
          {displayError && <p className="text-xs text-destructive">{displayError}</p>}
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

  // Local form state - buffers changes until Update is clicked
  const [formData, setFormData] = useState<Record<string, unknown>>(() => ({ ...node.data }));

  // Save animation state: 'idle' | 'saving' | 'saved'
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Reset form data and save state when node changes (user selects different node)
  useEffect(() => {
    setFormData({ ...node.data });
    setSaveState('idle');
  }, [node.id]); // Only reset when node ID changes, not on every data update

  // Check if form has unsaved changes
  const isDirty = useMemo(() => {
    const nodeDataKeys = Object.keys(node.data);
    const formDataKeys = Object.keys(formData);

    // Check if keys are different
    if (nodeDataKeys.length !== formDataKeys.length) return true;

    // Check if any value is different
    for (const key of formDataKeys) {
      const nodeValue = node.data[key];
      const formValue = formData[key];

      // Deep comparison for objects (like JSON fields)
      if (typeof formValue === 'object' && typeof nodeValue === 'object') {
        if (JSON.stringify(formValue) !== JSON.stringify(nodeValue)) return true;
      } else if (formValue !== nodeValue) {
        return true;
      }
    }

    return false;
  }, [node.data, formData]);

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

  // Compute validation errors against the local form data
  const validationErrors = useMemo(() => {
    return validateNodeData(node.type, formData);
  }, [node.type, formData]);

  // Create a map for easy field -> error lookup
  const errorsByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const error of validationErrors) {
      map.set(error.field, error.message);
    }
    return map;
  }, [validationErrors]);

  // Update local form state (doesn't save yet)
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  }, []);

  // Save changes to node with animation
  const handleUpdate = useCallback(() => {
    setSaveState('saving');

    // Brief delay to show spinner, then save
    setTimeout(() => {
      onUpdateData(formData);
      setSaveState('saved');

      // Show checkmark briefly, then return to idle
      setTimeout(() => {
        setSaveState('idle');
      }, 1000);
    }, 300);
  }, [formData, onUpdateData]);

  // Discard changes and reset to node data
  const handleDiscard = useCallback(() => {
    setFormData({ ...node.data });
  }, [node.data]);

  return (
    <div id="inspector-node-root" className="h-full flex flex-col gap-4">
      {/* Node header */}
      <div id="inspector-node-header" className="flex items-center gap-2 flex-shrink-0">
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
        <TabsContent
          value="config"
          className="mt-3 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
        >
          {configFields.length > 0 ? (
            <div id="inspector-config-fields" className="flex-1 overflow-auto space-y-3 px-1">
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
                    value={formData[field.name]}
                    onChange={(value) => handleFieldChange(field.name, value)}
                    error={errorsByField.get(field.name)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex-1">No configurable fields</p>
          )}

          {/* Update button - only show when there are config fields */}
          {configFields.length > 0 && (
            <div
              id="inspector-config-footer"
              className="pt-3 border-t mt-3 flex-shrink-0 flex items-center gap-2"
            >
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={!isDirty || validationErrors.length > 0 || saveState !== 'idle'}
                className="flex-1"
              >
                {saveState === 'saving' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Saving...
                  </>
                )}
                {saveState === 'saved' && (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Saved
                  </>
                )}
                {saveState === 'idle' && 'Update'}
              </Button>
              {isDirty && saveState === 'idle' && (
                <Button size="sm" variant="ghost" onClick={handleDiscard} className="text-xs">
                  Discard
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* Schema Tab */}
        <TabsContent
          value="schema"
          className="mt-3 data-[state=active]:flex-1 data-[state=active]:flex data-[state=active]:flex-col min-h-0"
        >
          {/* Wrapper for buttons + scrollable content */}
          <div id="inspector-schema-wrapper" className="relative flex-1 min-h-32 group">
            {/* Floating action buttons - positioned outside scroll context */}
            <div
              id="inspector-schema-buttons"
              className="absolute top-1 left-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
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
            {/* Scrollable content */}
            <div
              id="inspector-schema-content"
              ref={schemaContainerRef}
              tabIndex={0}
              onKeyDown={handleSchemaKeyDown}
              className="h-full rounded overflow-auto focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
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

  const hasMetadata = connection._extra && Object.keys(connection._extra).length > 0;

  return (
    <div className="space-y-4">
      <div className="font-semibold text-sm">Connection</div>

      {/* Connection ID */}
      <div className="space-y-1">
        <Label className="text-xs">ID</Label>
        <code className="block text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded truncate">
          {connection.id}
        </code>
      </div>

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
        <code className="block text-xs text-muted-foreground/70 font-mono truncate pl-1">
          {connection.fromNodeId}
        </code>
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
        <code className="block text-xs text-muted-foreground/70 font-mono truncate pl-1">
          {connection.toNodeId}
        </code>
      </div>

      {/* Metadata (from imported _extra fields) */}
      {hasMetadata && (
        <div className="space-y-1">
          <Label className="text-xs">Metadata</Label>
          <pre className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(connection._extra, null, 2)}
          </pre>
        </div>
      )}
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    <div id="inspector-panel" className="w-64 h-full flex flex-col bg-card border-l">
      {/* Header with toggle */}
      <div
        id="inspector-panel-header"
        className="p-3 border-b flex-shrink-0 flex items-center justify-between"
      >
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
      <div id="inspector-panel-content" className="flex-1 overflow-y-auto p-3">
        {renderContent()}
      </div>

      {/* Delete button - always at bottom */}
      {deleteInfo && (
        <>
          <div id="inspector-panel-footer" className="p-3 border-t flex-shrink-0">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <X className="w-4 h-4 mr-1" />
              {deleteInfo.label}
            </Button>
          </div>

          {/* Delete confirmation dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedNodes.length === 1
                    ? 'This will permanently delete the selected node and all its connections.'
                    : selectedNodes.length > 1
                      ? `This will permanently delete ${selectedNodes.length} nodes and all their connections.`
                      : 'This will permanently delete the selected connection.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deleteInfo.action();
                    setDeleteDialogOpen(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
});

import { memo, useCallback, useState } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  onDelete,
}: {
  node: WorkflowNode;
  onUpdateData: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const typeDef = getNodeTypeDefinition(node.type);
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
    <div className="space-y-4">
      {/* Node header */}
      <div className="flex items-center gap-2">
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
        <p className="text-xs text-muted-foreground">{typeDef.description}</p>
      )}

      {/* Config fields */}
      {configFields.length > 0 && (
        <div className="space-y-3 pt-2 border-t">
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
      )}

      {/* Delete button */}
      <div className="pt-3 border-t">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <X className="w-4 h-4 mr-1" />
          Delete Node
        </Button>
      </div>
    </div>
  );
});

// Multi-node inspector for multiple selected nodes
const MultiNodeInspector = memo(function MultiNodeInspector({
  nodes,
  onDelete,
}: {
  nodes: WorkflowNode[];
  onDelete: () => void;
}) {
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

      {/* Delete button */}
      <div className="pt-3 border-t">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <X className="w-4 h-4 mr-1" />
          Delete {nodes.length} Nodes
        </Button>
      </div>
    </div>
  );
});

// Connection inspector content
const ConnectionInspector = memo(function ConnectionInspector({
  connection,
  nodes,
  onDelete,
}: {
  connection: Connection;
  nodes: WorkflowNode[];
  onDelete: () => void;
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

      {/* Delete button */}
      <div className="pt-3 border-t">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <X className="w-4 h-4 mr-1" />
          Delete Connection
        </Button>
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
      return (
        <NodeInspector
          node={selectedNodes[0]}
          onUpdateData={handleUpdateData}
          onDelete={handleDeleteNodes}
        />
      );
    }

    if (selectedNodes.length > 1) {
      return <MultiNodeInspector nodes={selectedNodes} onDelete={handleDeleteNodes} />;
    }

    if (selectedConnection) {
      return (
        <ConnectionInspector
          connection={selectedConnection}
          nodes={nodes}
          onDelete={handleDeleteConnection}
        />
      );
    }

    return <EmptyState />;
  };

  return (
    <div className={`h-full flex transition-all duration-200 ${isOpen ? 'w-64' : 'w-6'}`}>
      {/* Collapse toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 flex-shrink-0 flex items-center justify-center hover:bg-muted/50 border-l transition-colors"
        aria-label={isOpen ? 'Collapse inspector' : 'Expand inspector'}
      >
        {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className="flex-1 h-full flex flex-col bg-card border-l overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b flex-shrink-0">
            <h3 className="font-semibold text-sm">Inspector</h3>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">{renderContent()}</div>
        </div>
      )}
    </div>
  );
});

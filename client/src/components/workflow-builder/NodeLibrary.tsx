import { memo, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';
import { NODE_TYPE_DEFINITIONS } from './models/nodeRegistry';
import type { NodeTypeDefinition } from './models/types';

interface NodeLibraryProps {
  selectedType: string | null;
  onSelectType: (type: string) => void;
  onAddNode: (type: string) => void;
}

interface NodeTypeItemProps {
  definition: NodeTypeDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onAddNode: () => void;
}

const NodeTypeItem = memo(function NodeTypeItem({
  definition,
  isSelected,
  onSelect,
  onAddNode,
}: NodeTypeItemProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/workflow-node-type', definition.type);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [definition.type]
  );

  return (
    <button
      onClick={onSelect}
      onDoubleClick={onAddNode}
      draggable
      onDragStart={handleDragStart}
      className={`
        w-full p-3 rounded-lg text-left transition-all cursor-grab active:cursor-grabbing
        ${isSelected ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Color indicator */}
        <div
          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: definition.color }}
        />

        <div className="flex-1 min-w-0">
          {/* Node name with optional docs link */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm">{definition.label}</span>
            {definition.docsUrl && (
              <a
                href={definition.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="text-muted-foreground/50 hover:text-primary transition-colors"
                title={`View ${definition.label} documentation`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Description */}
          {definition.description && (
            <div className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
              {definition.description}
            </div>
          )}
        </div>
      </div>
    </button>
  );
});

export const NodeLibrary = memo(function NodeLibrary({
  selectedType,
  onSelectType,
  onAddNode,
}: NodeLibraryProps) {
  return (
    <div className="h-full flex flex-col bg-card border-r">
      {/* Header */}
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">Node Library</h3>
      </div>

      {/* Node type list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {NODE_TYPE_DEFINITIONS.map((def) => (
          <NodeTypeItem
            key={def.type}
            definition={def}
            isSelected={selectedType === def.type}
            onSelect={() => onSelectType(def.type)}
            onAddNode={() => onAddNode(def.type)}
          />
        ))}
      </div>
    </div>
  );
});

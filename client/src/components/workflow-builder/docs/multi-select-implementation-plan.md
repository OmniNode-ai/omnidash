# Multi-Select Implementation Plan

## Overview

Add multi-select functionality to the workflow builder, allowing users to select multiple nodes and perform bulk operations (drag, delete, copy/paste).

## Features

### Selection Methods
1. **Click** - Select single node (clears other selections)
2. **Ctrl+Click** - Toggle node in/out of selection
3. **Click empty canvas** - Clear all selection
4. **Marquee drag** - Draw rectangle to select all nodes within

### Operations on Selected Nodes
1. **Multi-drag** - Drag one selected node, all move together
2. **Multi-delete** - Delete key removes all selected nodes
3. **Copy/paste** (future) - Copy selected nodes + internal connections

---

## Phase 1: Selection State

### State Changes

**Current:**
```typescript
selectedNodeId: string | null
```

**New:**
```typescript
selectedNodeIds: string[]
```

### Files to Modify

#### `models/types.ts`
- No changes needed (array is sufficient)

#### `hooks/useWorkflowState.ts`

1. Update `WorkflowState` interface:
```typescript
selectedNodeIds: string[];  // replaces selectedNodeId
```

2. Update `initialState`:
```typescript
selectedNodeIds: [],
```

3. Add/modify actions:
```typescript
| { type: 'SELECT_NODE'; payload: { nodeId: string; addToSelection?: boolean } }
| { type: 'SELECT_NODES'; payload: { nodeIds: string[] } }
| { type: 'CLEAR_NODE_SELECTION' }
```

4. Update reducer cases:
- `SELECT_NODE`: If `addToSelection`, toggle in array; otherwise replace array with single item
- `SELECT_NODES`: Replace array with new set (for marquee)
- `CLEAR_NODE_SELECTION`: Set to empty array
- `DELETE_NODE`: Remove from `selectedNodeIds` when deleted

5. Update action creators in returned `actions` object

#### `WorkflowCanvas.tsx`

1. Destructure `selectedNodeIds` instead of `selectedNodeId`
2. Update `handleCanvasClick` to use `actions.clearNodeSelection()`
3. Update node click handler to check for Ctrl key
4. Update `selectedNode` memo for inspector (handle multi-select case)
5. Pass `isSelected={selectedNodeIds.includes(node.id)}` to WorkflowNodeComponent

#### `hooks/useKeyboardShortcuts.ts`

1. Change `selectedNodeId` to `selectedNodeIds` parameter
2. Update delete logic to delete all selected nodes

#### `InspectorPanel.tsx`

1. Change props from `selectedNode` to `selectedNodes: WorkflowNode[]`
2. Add multi-select display:
   - 0 nodes: Empty state
   - 1 node: Current NodeInspector
   - 2+ nodes: "N nodes selected" + bulk delete button

---

## Phase 2: Click Behaviors

### Node Click Handler Changes

In `WorkflowCanvas.tsx`, modify how we handle node selection:

```typescript
const handleNodeClick = useCallback(
  (nodeId: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      actions.selectNode(nodeId, true);
    } else {
      // Single select (clears others)
      actions.selectNode(nodeId, false);
    }
  },
  [actions]
);
```

### WorkflowNode Changes

Need to add `onClick` handler prop to `WorkflowNodeComponent` (currently only has `onMouseDown`).

Distinguish between:
- `onMouseDown` - Start drag operation
- `onClick` - Handle selection (fires after mouseup if no drag occurred)

**Challenge:** Click fires after mousedown/mouseup. Need to track if drag occurred to avoid selecting after drag.

**Solution:** Track `hasDragged` state. Set true on first mousemove during drag. Reset on mouseup. Only fire click handler if `!hasDragged`.

---

## Phase 3: Multi-Drag

### State Changes

**Current:**
```typescript
interface DragState {
  isDragging: boolean;
  nodeId: string | null;
  startPosition: Position | null;
  offset: Position | null;
}
```

**New:**
```typescript
interface DragState {
  isDragging: boolean;
  draggedNodeIds: string[];
  nodeStartPositions: Record<string, Position>;  // Original positions
  mouseOffset: Position | null;  // Offset from primary node
}
```

### Drag Logic

When drag starts on a selected node:
1. Capture start positions of ALL selected nodes
2. Track mouse offset from the clicked node
3. On mouse move, apply same delta to all selected nodes
4. On mouse up, finalize all positions

When drag starts on an unselected node:
1. Clear selection, select only dragged node
2. Proceed with single-node drag (or: add to selection if ctrl held)

### Files to Modify

#### `hooks/useWorkflowState.ts`

1. Update `DragState` interface
2. Update `START_DRAG` to capture all selected node positions
3. Update `UPDATE_DRAG` to move all nodes by delta
4. Update `END_DRAG` to finalize

#### `WorkflowCanvas.tsx`

1. Update `handleNodeMouseDown` to pass selected nodes info
2. Ensure proper behavior for dragging selected vs unselected nodes

---

## Phase 4: Multi-Delete

### Changes

#### `hooks/useKeyboardShortcuts.ts`

```typescript
if (selectedNodeIds.length > 0) {
  // Delete all selected nodes
  selectedNodeIds.forEach(nodeId => onDeleteNode(nodeId));
}
```

Or better: Add `DELETE_NODES` action that handles batch deletion efficiently.

#### `hooks/useWorkflowState.ts`

Add batch delete action:
```typescript
| { type: 'DELETE_NODES'; payload: { nodeIds: string[] } }
```

Reducer:
```typescript
case 'DELETE_NODES': {
  const { nodeIds } = action.payload;
  const nodeIdSet = new Set(nodeIds);
  return {
    ...state,
    nodes: state.nodes.filter(n => !nodeIdSet.has(n.id)),
    connections: state.connections.filter(
      c => !nodeIdSet.has(c.fromNodeId) && !nodeIdSet.has(c.toNodeId)
    ),
    selectedNodeIds: [],
  };
}
```

---

## Phase 5: Inspector Updates

### InspectorPanel Props Change

```typescript
interface InspectorPanelProps {
  selectedNodes: WorkflowNode[];  // Changed from selectedNode
  selectedConnection: Connection | null;
  nodes: WorkflowNode[];
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNodes: (nodeIds: string[]) => void;  // Changed from onDeleteNode
  onDeleteConnection: (connectionId: string) => void;
}
```

### Multi-Select Display

```tsx
{selectedNodes.length === 0 && !selectedConnection && <EmptyState />}
{selectedNodes.length === 1 && <NodeInspector node={selectedNodes[0]} ... />}
{selectedNodes.length > 1 && <MultiNodeInspector nodes={selectedNodes} onDelete={...} />}
{selectedConnection && <ConnectionInspector ... />}
```

### MultiNodeInspector Component

Simple component showing:
- Count of selected nodes
- List of node types/labels
- Bulk delete button

---

## Phase 6: Marquee Selection

### New State

```typescript
interface MarqueeState {
  isSelecting: boolean;
  startPosition: Position | null;
  currentPosition: Position | null;
}
```

### New Component: `MarqueeRect.tsx`

```tsx
interface MarqueeRectProps {
  start: Position;
  current: Position;
}

export const MarqueeRect = memo(function MarqueeRect({ start, current }: MarqueeRectProps) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="rgba(59, 130, 246, 0.1)"
      stroke="#3b82f6"
      strokeWidth={1}
      strokeDasharray="4,4"
    />
  );
});
```

### Intersection Logic

Helper function to check if node intersects with marquee rectangle:

```typescript
function nodeIntersectsRect(
  node: WorkflowNode,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const nodeHeight = calculateNodeHeight(node);
  const nodeRect = {
    left: node.position.x,
    right: node.position.x + NODE.WIDTH,
    top: node.position.y,
    bottom: node.position.y + nodeHeight,
  };
  const selRect = {
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  };

  return !(
    nodeRect.right < selRect.left ||
    nodeRect.left > selRect.right ||
    nodeRect.bottom < selRect.top ||
    nodeRect.top > selRect.bottom
  );
}
```

### Interaction Flow

1. User clicks on empty canvas (not on node/port/connection)
2. On mouse down: Start marquee, record start position
3. On mouse move: Update current position, render rectangle
4. On mouse up: Calculate intersecting nodes, select them, clear marquee state

### Integration with Existing Handlers

Modify `handleCanvasMouseDown`:
- Left click on empty space starts marquee
- Middle click starts pan (existing)

Modify `handleMouseMove`:
- Add marquee update case

Modify `handleMouseUp`:
- Complete marquee selection

---

## Implementation Order

1. **Phase 1: Selection State** - Foundation for everything else
2. **Phase 2: Click Behaviors** - Basic multi-select via ctrl+click
3. **Phase 3: Multi-Drag** - Move selected nodes together
4. **Phase 4: Multi-Delete** - Delete selected nodes
5. **Phase 5: Inspector Updates** - UI feedback for multi-select
6. **Phase 6: Marquee Selection** - Rectangle selection

---

## Testing Checklist

### Selection
- [ ] Click node selects only that node
- [ ] Ctrl+click adds/removes node from selection
- [ ] Click empty canvas clears selection
- [ ] Deleting a node removes it from selection

### Multi-Drag
- [ ] Dragging selected node moves all selected nodes
- [ ] Dragging unselected node selects it and drags only it
- [ ] All nodes maintain relative positions during drag
- [ ] Positions update correctly after drag ends

### Multi-Delete
- [ ] Delete key removes all selected nodes
- [ ] All connections to deleted nodes are removed
- [ ] Selection is cleared after delete

### Inspector
- [ ] Shows empty state when nothing selected
- [ ] Shows node inspector for single selection
- [ ] Shows multi-select UI for multiple nodes
- [ ] Bulk delete works from inspector

### Marquee
- [ ] Clicking and dragging on canvas draws rectangle
- [ ] Rectangle renders correctly (accounts for drag direction)
- [ ] Nodes within rectangle are selected on release
- [ ] Marquee doesn't interfere with other interactions

---

## Future: Copy/Paste

Not in scope for this implementation, but design should support:

1. **Copy (Ctrl+C)**
   - Serialize selected nodes
   - Serialize connections where both endpoints are selected
   - Store in clipboard state (or system clipboard as JSON)

2. **Paste (Ctrl+V)**
   - Generate new IDs for all nodes
   - Offset positions (e.g., +20, +20)
   - Remap connection references to new IDs
   - Add to canvas and select pasted nodes

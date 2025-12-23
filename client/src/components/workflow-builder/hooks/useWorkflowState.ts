import { useReducer, useCallback } from 'react';
import type {
  WorkflowNode,
  Connection,
  Position,
  Port,
  CanvasState,
  DragState,
  ConnectionDragState,
  RewireState,
  PanDragState,
  MarqueeState,
} from '../models/types';
import type { ClipboardData } from '../models/types';
import { CANVAS } from '../models/constants';
import { generateId, clamp } from '../utils/svg';
import {
  getNodeTypeDefinition,
  getDefaultNodeData,
  DEFAULT_NODE_TYPE,
} from '../models/nodeRegistry';
import {
  exportWorkflow,
  importWorkflow,
  downloadWorkflowAsFile,
  readWorkflowFromFile,
} from '../utils/workflow-io';
import type { WorkflowExport } from '../utils/workflow-io';

// History snapshot type (only workflow data, not UI state)
interface HistorySnapshot {
  nodes: WorkflowNode[];
  connections: Connection[];
}

// State
interface WorkflowState {
  nodes: WorkflowNode[];
  connections: Connection[];
  canvas: CanvasState;
  drag: DragState;
  connectionDrag: ConnectionDragState;
  rewire: RewireState;
  panDrag: PanDragState;
  marquee: MarqueeState;
  selectedNodeIds: string[];
  selectedConnectionId: string | null;
  // Undo/redo history (past states for undo, future states for redo)
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  // Workflow-level metadata from import (for round-trip preservation)
  workflowMeta?: Record<string, unknown>;
}

// Max history entries to prevent unbounded memory growth
const MAX_HISTORY_SIZE = 50;

const initialRewireState: RewireState = {
  isRewiring: false,
  connectionId: null,
  movingEnd: null,
  fixedPortPosition: null,
  currentPosition: null,
};

const initialPanDragState: PanDragState = {
  isPanning: false,
  startPan: null,
  startMouse: null,
};

const initialMarqueeState: MarqueeState = {
  isSelecting: false,
  startPosition: null,
  currentPosition: null,
};

const initialDragState: DragState = {
  isDragging: false,
  nodeId: null,
  startPosition: null,
  offset: null,
  nodeStartPositions: {},
};

const initialState: WorkflowState = {
  nodes: [],
  connections: [],
  canvas: { pan: { x: 0, y: 0 }, zoom: 1 },
  drag: initialDragState,
  connectionDrag: { isDrawing: false, startPort: null, startPosition: null, currentPosition: null },
  rewire: initialRewireState,
  panDrag: initialPanDragState,
  marquee: initialMarqueeState,
  selectedNodeIds: [],
  selectedConnectionId: null,
  past: [],
  future: [],
};

// Actions
type Action =
  | { type: 'ADD_NODE'; payload: { position: Position; nodeType: string } }
  | { type: 'UPDATE_NODE_POSITION'; payload: { nodeId: string; position: Position } }
  | { type: 'UPDATE_NODE_DATA'; payload: { nodeId: string; data: Record<string, unknown> } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string } }
  | { type: 'DELETE_NODES'; payload: { nodeIds: string[] } }
  | { type: 'SELECT_NODE'; payload: { nodeId: string; addToSelection?: boolean } }
  | { type: 'SELECT_NODES'; payload: { nodeIds: string[] } }
  | { type: 'CLEAR_NODE_SELECTION' }
  | { type: 'SELECT_CONNECTION'; payload: { connectionId: string | null } }
  | { type: 'START_DRAG'; payload: { nodeId: string; offset: Position; ctrlKey?: boolean } }
  | { type: 'UPDATE_DRAG'; payload: { position: Position } }
  | { type: 'END_DRAG' }
  | { type: 'START_CONNECTION'; payload: { port: Port; position: Position } }
  | { type: 'UPDATE_CONNECTION_DRAG'; payload: { position: Position } }
  | { type: 'END_CONNECTION'; payload: { endPort: Port } }
  | { type: 'CANCEL_CONNECTION' }
  | { type: 'DELETE_CONNECTION'; payload: { connectionId: string } }
  | {
      type: 'START_REWIRE';
      payload: {
        connectionId: string;
        movingEnd: 'from' | 'to';
        fixedPortPosition: Position;
        startPosition: Position;
      };
    }
  | { type: 'UPDATE_REWIRE'; payload: { position: Position } }
  | { type: 'END_REWIRE'; payload: { endPort: Port } }
  | { type: 'CANCEL_REWIRE' }
  | { type: 'START_PAN'; payload: { startPan: Position; startMouse: Position } }
  | { type: 'UPDATE_PAN'; payload: { currentMouse: Position } }
  | { type: 'END_PAN' }
  | { type: 'SET_PAN'; payload: Position }
  | { type: 'SET_ZOOM'; payload: { zoom: number; center?: Position } }
  | { type: 'RESET_VIEW' }
  | { type: 'START_MARQUEE'; payload: { position: Position } }
  | { type: 'UPDATE_MARQUEE'; payload: { position: Position } }
  | { type: 'END_MARQUEE'; payload: { selectedNodeIds: string[] } }
  | { type: 'CANCEL_MARQUEE' }
  | { type: 'PASTE_NODES'; payload: { clipboardData: ClipboardData; offset: Position } }
  | {
      type: 'IMPORT_WORKFLOW';
      payload: {
        nodes: WorkflowNode[];
        connections: Connection[];
        workflowMeta?: Record<string, unknown>;
      };
    }
  | { type: 'CLEAR_WORKFLOW' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// Actions that should trigger a history snapshot before execution
const HISTORY_TRIGGERING_ACTIONS = new Set([
  'ADD_NODE',
  'UPDATE_NODE_DATA',
  'DELETE_NODE',
  'DELETE_NODES',
  'START_DRAG', // Snapshot before dragging so undo restores original positions
  'END_CONNECTION',
  'DELETE_CONNECTION',
  'END_REWIRE',
  'CANCEL_REWIRE',
  'PASTE_NODES',
]);

// Helper to push current state to past (called before mutating actions)
function pushToPast(state: WorkflowState): WorkflowState {
  // Create snapshot of current workflow state
  const snapshot: HistorySnapshot = {
    nodes: state.nodes,
    connections: state.connections,
  };

  // Add to past, cap size, clear future (new action invalidates redo)
  let newPast = [...state.past, snapshot];
  if (newPast.length > MAX_HISTORY_SIZE) {
    newPast = newPast.slice(-MAX_HISTORY_SIZE);
  }

  return {
    ...state,
    past: newPast,
    future: [], // Clear redo stack on new action
  };
}

function createNode(position: Position, nodeType: string): WorkflowNode {
  const id = generateId();
  const typeDef = getNodeTypeDefinition(nodeType) || DEFAULT_NODE_TYPE;

  // Create input ports from type definition
  const inputPorts: Port[] = typeDef.inputs.map((portDef, index) => ({
    id: `${id}-in-${index}`,
    name: portDef.name,
    type: 'input' as const,
    nodeId: id,
    index,
    maxConnections: portDef.maxConnections,
  }));

  // Create output ports from type definition
  const outputPorts: Port[] = typeDef.outputs.map((portDef, index) => ({
    id: `${id}-out-${index}`,
    name: portDef.name,
    type: 'output' as const,
    nodeId: id,
    index,
    maxConnections: portDef.maxConnections,
  }));

  // Initialize data with default values from configFields
  const defaultData = getDefaultNodeData(nodeType);

  return {
    id,
    type: nodeType,
    position,
    data: defaultData,
    inputPorts,
    outputPorts,
  };
}

function workflowReducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case 'ADD_NODE': {
      const node = createNode(action.payload.position, action.payload.nodeType);
      return { ...state, nodes: [...state.nodes, node] };
    }

    case 'UPDATE_NODE_POSITION': {
      const { nodeId, position } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
      };
    }

    case 'UPDATE_NODE_DATA': {
      const { nodeId, data } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, data } : node)),
      };
    }

    case 'DELETE_NODE': {
      const { nodeId } = action.payload;
      return {
        ...state,
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        connections: state.connections.filter(
          (conn) => conn.fromNodeId !== nodeId && conn.toNodeId !== nodeId
        ),
        selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
      };
    }

    case 'DELETE_NODES': {
      const { nodeIds } = action.payload;
      const nodeIdSet = new Set(nodeIds);
      return {
        ...state,
        nodes: state.nodes.filter((node) => !nodeIdSet.has(node.id)),
        connections: state.connections.filter(
          (conn) => !nodeIdSet.has(conn.fromNodeId) && !nodeIdSet.has(conn.toNodeId)
        ),
        selectedNodeIds: [],
      };
    }

    case 'SELECT_NODE': {
      const { nodeId, addToSelection } = action.payload;
      if (addToSelection) {
        // Toggle: add if not present, remove if present
        const isSelected = state.selectedNodeIds.includes(nodeId);
        return {
          ...state,
          selectedNodeIds: isSelected
            ? state.selectedNodeIds.filter((id) => id !== nodeId)
            : [...state.selectedNodeIds, nodeId],
          selectedConnectionId: null,
        };
      }
      // Single select: replace selection with just this node
      return {
        ...state,
        selectedNodeIds: [nodeId],
        selectedConnectionId: null,
      };
    }

    case 'SELECT_NODES':
      return {
        ...state,
        selectedNodeIds: action.payload.nodeIds,
        selectedConnectionId: null,
      };

    case 'CLEAR_NODE_SELECTION':
      return {
        ...state,
        selectedNodeIds: [],
      };

    case 'SELECT_CONNECTION':
      return {
        ...state,
        selectedConnectionId: action.payload.connectionId,
        selectedNodeIds: [], // Clear node selection when selecting connection
      };

    case 'START_DRAG': {
      const { nodeId, ctrlKey } = action.payload;
      const isAlreadySelected = state.selectedNodeIds.includes(nodeId);

      // Determine new selection based on ctrl key
      let newSelectedNodeIds: string[];
      if (ctrlKey) {
        // Ctrl+click: toggle selection
        if (isAlreadySelected) {
          // Remove from selection, but keep at least this node selected for drag
          const remaining = state.selectedNodeIds.filter((id) => id !== nodeId);
          newSelectedNodeIds = remaining.length > 0 ? remaining : [nodeId];
        } else {
          // Add to selection
          newSelectedNodeIds = [...state.selectedNodeIds, nodeId];
        }
      } else {
        // Normal click: if already selected, keep selection; otherwise select only this node
        newSelectedNodeIds = isAlreadySelected ? state.selectedNodeIds : [nodeId];
      }

      // Capture start positions of all nodes that will be dragged
      const nodeStartPositions: Record<string, Position> = {};
      for (const id of newSelectedNodeIds) {
        const node = state.nodes.find((n) => n.id === id);
        if (node) {
          nodeStartPositions[id] = { ...node.position };
        }
      }

      return {
        ...state,
        drag: {
          isDragging: true,
          nodeId,
          startPosition: null,
          offset: action.payload.offset,
          nodeStartPositions,
        },
        selectedNodeIds: newSelectedNodeIds,
        selectedConnectionId: null, // Clear connection selection when dragging node
      };
    }

    case 'UPDATE_DRAG': {
      if (!state.drag.isDragging || !state.drag.nodeId || !state.drag.offset) {
        return state;
      }

      // Calculate new position for the primary node
      const primaryNewPosition = {
        x: action.payload.position.x - state.drag.offset.x,
        y: action.payload.position.y - state.drag.offset.y,
      };

      // Calculate delta from primary node's start position
      const primaryStartPos = state.drag.nodeStartPositions[state.drag.nodeId];
      if (!primaryStartPos) {
        // Fallback to single node drag
        return {
          ...state,
          nodes: state.nodes.map((node) =>
            node.id === state.drag.nodeId ? { ...node, position: primaryNewPosition } : node
          ),
        };
      }

      const delta = {
        x: primaryNewPosition.x - primaryStartPos.x,
        y: primaryNewPosition.y - primaryStartPos.y,
      };

      // Move all dragged nodes by the same delta
      return {
        ...state,
        nodes: state.nodes.map((node) => {
          const startPos = state.drag.nodeStartPositions[node.id];
          if (!startPos) return node;
          return {
            ...node,
            position: {
              x: startPos.x + delta.x,
              y: startPos.y + delta.y,
            },
          };
        }),
      };
    }

    case 'END_DRAG':
      return {
        ...state,
        drag: initialDragState,
      };

    case 'START_CONNECTION':
      return {
        ...state,
        connectionDrag: {
          isDrawing: true,
          startPort: action.payload.port,
          startPosition: action.payload.position,
          currentPosition: action.payload.position,
        },
      };

    case 'UPDATE_CONNECTION_DRAG':
      return {
        ...state,
        connectionDrag: {
          ...state.connectionDrag,
          currentPosition: action.payload.position,
        },
      };

    case 'END_CONNECTION': {
      const { startPort } = state.connectionDrag;
      const { endPort } = action.payload;

      // Validate connection
      if (!startPort || !endPort) {
        return { ...state, connectionDrag: initialState.connectionDrag };
      }

      // Can't connect same types (input to input or output to output)
      if (startPort.type === endPort.type) {
        return { ...state, connectionDrag: initialState.connectionDrag };
      }

      // Can't connect to same node
      if (startPort.nodeId === endPort.nodeId) {
        return { ...state, connectionDrag: initialState.connectionDrag };
      }

      // Determine from/to based on port types
      const fromPort = startPort.type === 'output' ? startPort : endPort;
      const toPort = startPort.type === 'output' ? endPort : startPort;

      // Check if this exact connection already exists
      const exists = state.connections.some(
        (conn) => conn.fromPortId === fromPort.id && conn.toPortId === toPort.id
      );

      if (exists) {
        return { ...state, connectionDrag: initialState.connectionDrag };
      }

      // Check if input port has a connection limit (maxConnections)
      // If maxConnections is set, remove excess connections to enforce the limit
      let filteredConnections = state.connections;
      if (toPort.maxConnections !== undefined) {
        const existingToPort = state.connections.filter((conn) => conn.toPortId === toPort.id);
        if (existingToPort.length >= toPort.maxConnections) {
          // Remove oldest connections to make room (keep only maxConnections - 1)
          const connectionsToRemove = new Set(
            existingToPort
              .slice(0, existingToPort.length - toPort.maxConnections + 1)
              .map((c) => c.id)
          );
          filteredConnections = state.connections.filter(
            (conn) => !connectionsToRemove.has(conn.id)
          );
        }
      }

      const connection: Connection = {
        id: generateId(),
        fromPortId: fromPort.id,
        toPortId: toPort.id,
        fromNodeId: fromPort.nodeId,
        toNodeId: toPort.nodeId,
      };

      return {
        ...state,
        connections: [...filteredConnections, connection],
        connectionDrag: initialState.connectionDrag,
      };
    }

    case 'CANCEL_CONNECTION':
      return { ...state, connectionDrag: initialState.connectionDrag };

    case 'DELETE_CONNECTION': {
      const { connectionId } = action.payload;
      return {
        ...state,
        connections: state.connections.filter((conn) => conn.id !== connectionId),
        selectedConnectionId:
          state.selectedConnectionId === connectionId ? null : state.selectedConnectionId,
      };
    }

    case 'START_REWIRE':
      return {
        ...state,
        rewire: {
          isRewiring: true,
          connectionId: action.payload.connectionId,
          movingEnd: action.payload.movingEnd,
          fixedPortPosition: action.payload.fixedPortPosition,
          currentPosition: action.payload.startPosition,
        },
      };

    case 'UPDATE_REWIRE':
      return {
        ...state,
        rewire: {
          ...state.rewire,
          currentPosition: action.payload.position,
        },
      };

    case 'END_REWIRE': {
      const { rewire, connections } = state;
      const { endPort } = action.payload;

      if (!rewire.isRewiring || !rewire.connectionId || !rewire.movingEnd) {
        return { ...state, rewire: initialRewireState };
      }

      const connection = connections.find((c) => c.id === rewire.connectionId);
      if (!connection) {
        return { ...state, rewire: initialRewireState };
      }

      // Validate: moving 'from' end needs an output port, moving 'to' end needs an input port
      const expectedPortType = rewire.movingEnd === 'from' ? 'output' : 'input';
      if (endPort.type !== expectedPortType) {
        return { ...state, rewire: initialRewireState };
      }

      // Can't connect to the same node as the fixed end
      const fixedNodeId = rewire.movingEnd === 'from' ? connection.toNodeId : connection.fromNodeId;
      if (endPort.nodeId === fixedNodeId) {
        return { ...state, rewire: initialRewireState };
      }

      // Check if rewiring to an input port with a connection limit (maxConnections)
      let filteredConnections = connections;
      if (rewire.movingEnd === 'to' && endPort.maxConnections !== undefined) {
        // Count existing connections to this port (excluding the one we're rewiring)
        const existingToPort = connections.filter(
          (conn) => conn.toPortId === endPort.id && conn.id !== rewire.connectionId
        );
        if (existingToPort.length >= endPort.maxConnections) {
          // Remove oldest connections to make room
          const connectionsToRemove = new Set(
            existingToPort
              .slice(0, existingToPort.length - endPort.maxConnections + 1)
              .map((c) => c.id)
          );
          filteredConnections = connections.filter((conn) => !connectionsToRemove.has(conn.id));
        }
      }

      // Update the connection
      const updatedConnections = filteredConnections.map((conn) => {
        if (conn.id !== rewire.connectionId) return conn;

        if (rewire.movingEnd === 'from') {
          return {
            ...conn,
            fromPortId: endPort.id,
            fromNodeId: endPort.nodeId,
          };
        } else {
          return {
            ...conn,
            toPortId: endPort.id,
            toNodeId: endPort.nodeId,
          };
        }
      });

      return {
        ...state,
        connections: updatedConnections,
        rewire: initialRewireState,
      };
    }

    case 'CANCEL_REWIRE': {
      // Dropping in empty space during rewire = delete the connection
      const connectionToDelete = state.rewire.connectionId;
      return {
        ...state,
        connections: connectionToDelete
          ? state.connections.filter((conn) => conn.id !== connectionToDelete)
          : state.connections,
        selectedConnectionId:
          state.selectedConnectionId === connectionToDelete ? null : state.selectedConnectionId,
        rewire: initialRewireState,
      };
    }

    case 'START_PAN':
      return {
        ...state,
        panDrag: {
          isPanning: true,
          startPan: action.payload.startPan,
          startMouse: action.payload.startMouse,
        },
      };

    case 'UPDATE_PAN': {
      const { panDrag, canvas } = state;
      if (!panDrag.isPanning || !panDrag.startPan || !panDrag.startMouse) {
        return state;
      }

      // Calculate delta in screen pixels, then convert to canvas units
      const deltaX = (action.payload.currentMouse.x - panDrag.startMouse.x) / canvas.zoom;
      const deltaY = (action.payload.currentMouse.y - panDrag.startMouse.y) / canvas.zoom;

      return {
        ...state,
        canvas: {
          ...canvas,
          pan: {
            x: panDrag.startPan.x - deltaX,
            y: panDrag.startPan.y - deltaY,
          },
        },
      };
    }

    case 'END_PAN':
      return { ...state, panDrag: initialPanDragState };

    case 'SET_PAN':
      return { ...state, canvas: { ...state.canvas, pan: action.payload } };

    case 'SET_ZOOM': {
      const { zoom, center } = action.payload;
      const newZoom = clamp(zoom, CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);
      const { canvas } = state;

      // If a center point is provided, adjust pan to zoom toward that point
      if (center) {
        const zoomRatio = newZoom / canvas.zoom;
        const newPan = {
          x: center.x - (center.x - canvas.pan.x) / zoomRatio,
          y: center.y - (center.y - canvas.pan.y) / zoomRatio,
        };
        return {
          ...state,
          canvas: { pan: newPan, zoom: newZoom },
        };
      }

      return {
        ...state,
        canvas: { ...canvas, zoom: newZoom },
      };
    }

    case 'RESET_VIEW':
      return { ...state, canvas: { pan: { x: 0, y: 0 }, zoom: 1 }, panDrag: initialPanDragState };

    case 'START_MARQUEE':
      return {
        ...state,
        marquee: {
          isSelecting: true,
          startPosition: action.payload.position,
          currentPosition: action.payload.position,
        },
      };

    case 'UPDATE_MARQUEE':
      return {
        ...state,
        marquee: {
          ...state.marquee,
          currentPosition: action.payload.position,
        },
      };

    case 'END_MARQUEE':
      return {
        ...state,
        marquee: initialMarqueeState,
        selectedNodeIds: action.payload.selectedNodeIds,
        selectedConnectionId: null,
      };

    case 'CANCEL_MARQUEE':
      return {
        ...state,
        marquee: initialMarqueeState,
      };

    case 'PASTE_NODES': {
      const { clipboardData, offset } = action.payload;
      if (!clipboardData || clipboardData.nodes.length === 0) return state;

      // Generate new IDs and create nodes
      const indexToNewId = new Map<number, string>();
      const newNodes: WorkflowNode[] = clipboardData.nodes.map((clipNode) => {
        const newId = generateId();
        indexToNewId.set(clipNode.clipboardIndex, newId);

        const typeDef = getNodeTypeDefinition(clipNode.type) || DEFAULT_NODE_TYPE;

        // Create ports based on stored counts (or use type definition as fallback)
        const inputPorts: Port[] = typeDef.inputs
          .slice(0, clipNode.inputPortCount)
          .map((portDef, index) => ({
            id: `${newId}-in-${index}`,
            name: portDef.name,
            type: 'input' as const,
            nodeId: newId,
            index,
            maxConnections: portDef.maxConnections,
          }));

        const outputPorts: Port[] = typeDef.outputs
          .slice(0, clipNode.outputPortCount)
          .map((portDef, index) => ({
            id: `${newId}-out-${index}`,
            name: portDef.name,
            type: 'output' as const,
            nodeId: newId,
            index,
            maxConnections: portDef.maxConnections,
          }));

        // Merge clipboard data with defaults (clipboard data takes precedence)
        const defaultData = getDefaultNodeData(clipNode.type);

        return {
          id: newId,
          type: clipNode.type,
          position: {
            x: offset.x + clipNode.relativePosition.x,
            y: offset.y + clipNode.relativePosition.y,
          },
          data: { ...defaultData, ...clipNode.data },
          inputPorts,
          outputPorts,
        };
      });

      // Recreate connections using the ID mapping
      const newConnections: Connection[] = clipboardData.connections.map((clipConn) => {
        const fromNodeId = indexToNewId.get(clipConn.fromNodeIndex) ?? '';
        const toNodeId = indexToNewId.get(clipConn.toNodeIndex) ?? '';

        return {
          id: generateId(),
          fromPortId: `${fromNodeId}-out-${clipConn.fromPortIndex}`,
          toPortId: `${toNodeId}-in-${clipConn.toPortIndex}`,
          fromNodeId,
          toNodeId,
        };
      });

      // Select the newly pasted nodes
      const newNodeIds = newNodes.map((n) => n.id);

      return {
        ...state,
        nodes: [...state.nodes, ...newNodes],
        connections: [...state.connections, ...newConnections],
        selectedNodeIds: newNodeIds,
        selectedConnectionId: null,
      };
    }

    case 'IMPORT_WORKFLOW': {
      const { nodes, connections, workflowMeta } = action.payload;
      return {
        ...initialState,
        nodes,
        connections,
        workflowMeta,
      };
    }

    case 'CLEAR_WORKFLOW': {
      return initialState;
    }

    case 'UNDO': {
      if (state.past.length === 0) {
        return state; // Nothing to undo
      }

      // Pop from past, push current to future
      const newPast = state.past.slice(0, -1);
      const previousState = state.past[state.past.length - 1];
      const currentSnapshot: HistorySnapshot = {
        nodes: state.nodes,
        connections: state.connections,
      };

      return {
        ...state,
        nodes: previousState.nodes,
        connections: previousState.connections,
        past: newPast,
        future: [currentSnapshot, ...state.future],
        selectedNodeIds: [],
        selectedConnectionId: null,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) {
        return state; // Nothing to redo
      }

      // Pop from future, push current to past
      const [nextState, ...newFuture] = state.future;
      const currentSnapshot: HistorySnapshot = {
        nodes: state.nodes,
        connections: state.connections,
      };

      return {
        ...state,
        nodes: nextState.nodes,
        connections: nextState.connections,
        past: [...state.past, currentSnapshot],
        future: newFuture,
        selectedNodeIds: [],
        selectedConnectionId: null,
      };
    }

    default:
      return state;
  }
}

// Wrapper reducer that handles history snapshots automatically
function workflowReducerWithHistory(state: WorkflowState, action: Action): WorkflowState {
  // If this action should trigger a history snapshot, save current state first
  if (HISTORY_TRIGGERING_ACTIONS.has(action.type)) {
    state = pushToPast(state);
  }

  return workflowReducer(state, action);
}

export function useWorkflowState() {
  const [state, dispatch] = useReducer(workflowReducerWithHistory, initialState);

  const actions = {
    addNode: useCallback((position: Position, nodeType: string) => {
      dispatch({ type: 'ADD_NODE', payload: { position, nodeType } });
    }, []),

    updateNodePosition: useCallback((nodeId: string, position: Position) => {
      dispatch({ type: 'UPDATE_NODE_POSITION', payload: { nodeId, position } });
    }, []),

    updateNodeData: useCallback((nodeId: string, data: Record<string, unknown>) => {
      dispatch({ type: 'UPDATE_NODE_DATA', payload: { nodeId, data } });
    }, []),

    deleteNode: useCallback((nodeId: string) => {
      dispatch({ type: 'DELETE_NODE', payload: { nodeId } });
    }, []),

    deleteNodes: useCallback((nodeIds: string[]) => {
      dispatch({ type: 'DELETE_NODES', payload: { nodeIds } });
    }, []),

    selectNode: useCallback((nodeId: string, addToSelection?: boolean) => {
      dispatch({ type: 'SELECT_NODE', payload: { nodeId, addToSelection } });
    }, []),

    selectNodes: useCallback((nodeIds: string[]) => {
      dispatch({ type: 'SELECT_NODES', payload: { nodeIds } });
    }, []),

    clearNodeSelection: useCallback(() => {
      dispatch({ type: 'CLEAR_NODE_SELECTION' });
    }, []),

    selectConnection: useCallback((connectionId: string | null) => {
      dispatch({ type: 'SELECT_CONNECTION', payload: { connectionId } });
    }, []),

    startDrag: useCallback((nodeId: string, offset: Position, ctrlKey?: boolean) => {
      dispatch({ type: 'START_DRAG', payload: { nodeId, offset, ctrlKey } });
    }, []),

    updateDrag: useCallback((position: Position) => {
      dispatch({ type: 'UPDATE_DRAG', payload: { position } });
    }, []),

    endDrag: useCallback(() => {
      dispatch({ type: 'END_DRAG' });
    }, []),

    startConnection: useCallback((port: Port, position: Position) => {
      dispatch({ type: 'START_CONNECTION', payload: { port, position } });
    }, []),

    updateConnectionDrag: useCallback((position: Position) => {
      dispatch({ type: 'UPDATE_CONNECTION_DRAG', payload: { position } });
    }, []),

    endConnection: useCallback((endPort: Port) => {
      dispatch({ type: 'END_CONNECTION', payload: { endPort } });
    }, []),

    cancelConnection: useCallback(() => {
      dispatch({ type: 'CANCEL_CONNECTION' });
    }, []),

    deleteConnection: useCallback((connectionId: string) => {
      dispatch({ type: 'DELETE_CONNECTION', payload: { connectionId } });
    }, []),

    startRewire: useCallback(
      (
        connectionId: string,
        movingEnd: 'from' | 'to',
        fixedPortPosition: Position,
        startPosition: Position
      ) => {
        dispatch({
          type: 'START_REWIRE',
          payload: { connectionId, movingEnd, fixedPortPosition, startPosition },
        });
      },
      []
    ),

    updateRewire: useCallback((position: Position) => {
      dispatch({ type: 'UPDATE_REWIRE', payload: { position } });
    }, []),

    endRewire: useCallback((endPort: Port) => {
      dispatch({ type: 'END_REWIRE', payload: { endPort } });
    }, []),

    cancelRewire: useCallback(() => {
      dispatch({ type: 'CANCEL_REWIRE' });
    }, []),

    startPan: useCallback((startPan: Position, startMouse: Position) => {
      dispatch({ type: 'START_PAN', payload: { startPan, startMouse } });
    }, []),

    updatePan: useCallback((currentMouse: Position) => {
      dispatch({ type: 'UPDATE_PAN', payload: { currentMouse } });
    }, []),

    endPan: useCallback(() => {
      dispatch({ type: 'END_PAN' });
    }, []),

    setPan: useCallback((pan: Position) => {
      dispatch({ type: 'SET_PAN', payload: pan });
    }, []),

    setZoom: useCallback((zoom: number, center?: Position) => {
      dispatch({ type: 'SET_ZOOM', payload: { zoom, center } });
    }, []),

    resetView: useCallback(() => {
      dispatch({ type: 'RESET_VIEW' });
    }, []),

    startMarquee: useCallback((position: Position) => {
      dispatch({ type: 'START_MARQUEE', payload: { position } });
    }, []),

    updateMarquee: useCallback((position: Position) => {
      dispatch({ type: 'UPDATE_MARQUEE', payload: { position } });
    }, []),

    endMarquee: useCallback((selectedNodeIds: string[]) => {
      dispatch({ type: 'END_MARQUEE', payload: { selectedNodeIds } });
    }, []),

    cancelMarquee: useCallback(() => {
      dispatch({ type: 'CANCEL_MARQUEE' });
    }, []),

    pasteNodes: useCallback((clipboardData: ClipboardData, offset: Position) => {
      dispatch({ type: 'PASTE_NODES', payload: { clipboardData, offset } });
    }, []),

    // Export workflow to JSON (preserves any imported metadata)
    getWorkflowExport: useCallback((): WorkflowExport => {
      return exportWorkflow(state.nodes, state.connections, state.workflowMeta);
    }, [state.nodes, state.connections, state.workflowMeta]),

    // Download workflow as JSON file (preserves any imported metadata)
    downloadWorkflow: useCallback(
      (filename?: string) => {
        downloadWorkflowAsFile(state.nodes, state.connections, filename, state.workflowMeta);
      },
      [state.nodes, state.connections, state.workflowMeta]
    ),

    // Import workflow from JSON data (preserves unknown fields for round-trip)
    loadWorkflow: useCallback((data: WorkflowExport) => {
      const createPorts = (nodeId: string, nodeType: string) => {
        const typeDef = getNodeTypeDefinition(nodeType) || DEFAULT_NODE_TYPE;
        const inputPorts: Port[] = typeDef.inputs.map((portDef, index) => ({
          id: `${nodeId}-in-${index}`,
          name: portDef.name,
          type: 'input' as const,
          nodeId,
          index,
          maxConnections: portDef.maxConnections,
        }));
        const outputPorts: Port[] = typeDef.outputs.map((portDef, index) => ({
          id: `${nodeId}-out-${index}`,
          name: portDef.name,
          type: 'output' as const,
          nodeId,
          index,
          maxConnections: portDef.maxConnections,
        }));
        return { inputPorts, outputPorts };
      };

      const result = importWorkflow(data, createPorts);
      if (result) {
        dispatch({
          type: 'IMPORT_WORKFLOW',
          payload: {
            nodes: result.nodes,
            connections: result.connections,
            workflowMeta: result.workflowMeta,
          },
        });
        return true;
      }
      return false;
    }, []),

    // Load workflow from a File object (preserves unknown fields for round-trip)
    loadWorkflowFromFile: useCallback(async (file: File): Promise<boolean> => {
      const data = await readWorkflowFromFile(file);
      if (!data) return false;

      const createPorts = (nodeId: string, nodeType: string) => {
        const typeDef = getNodeTypeDefinition(nodeType) || DEFAULT_NODE_TYPE;
        const inputPorts: Port[] = typeDef.inputs.map((portDef, index) => ({
          id: `${nodeId}-in-${index}`,
          name: portDef.name,
          type: 'input' as const,
          nodeId,
          index,
          maxConnections: portDef.maxConnections,
        }));
        const outputPorts: Port[] = typeDef.outputs.map((portDef, index) => ({
          id: `${nodeId}-out-${index}`,
          name: portDef.name,
          type: 'output' as const,
          nodeId,
          index,
          maxConnections: portDef.maxConnections,
        }));
        return { inputPorts, outputPorts };
      };

      const result = importWorkflow(data, createPorts);
      if (result) {
        dispatch({
          type: 'IMPORT_WORKFLOW',
          payload: {
            nodes: result.nodes,
            connections: result.connections,
            workflowMeta: result.workflowMeta,
          },
        });
        return true;
      }
      return false;
    }, []),

    // Clear the workflow
    clearWorkflow: useCallback(() => {
      dispatch({ type: 'CLEAR_WORKFLOW' });
    }, []),

    // Undo/redo
    undo: useCallback(() => {
      dispatch({ type: 'UNDO' });
    }, []),

    redo: useCallback(() => {
      dispatch({ type: 'REDO' });
    }, []),

    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };

  return { state, actions };
}

import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useWorkflowState } from './hooks/useWorkflowState';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { WorkflowNodeComponent } from './WorkflowNode';
import { InspectorPanel } from './InspectorPanel';
import { ConnectionLines } from './ConnectionLines';
import { GridBackground } from './GridBackground';
import { MarqueeRect } from './MarqueeRect';
import { NODE, CANVAS, calculateNodeHeight } from './models/constants';
import { screenToSvg } from './utils/svg';
import {
  createClipboardData,
  writeToSystemClipboard,
  readFromSystemClipboard,
} from './utils/clipboard';
import type { Port, Position } from './models/types';
import type { WorkflowExport } from './utils/workflow-io';

interface WorkflowCanvasProps {
  selectedNodeType?: string;
}

export interface WorkflowCanvasHandle {
  addNodeAtCenter: (type: string) => void;
  downloadWorkflow: (filename?: string) => void;
  loadWorkflow: (data: WorkflowExport) => boolean;
  loadWorkflowFromFile: (file: File) => Promise<boolean>;
  clearWorkflow: () => void;
  getNodeCount: () => number;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas({ selectedNodeType = 'action' }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const justFinishedMarqueeRef = useRef(false);
    const { state, actions } = useWorkflowState();
    const {
      nodes,
      connections,
      canvas,
      drag,
      connectionDrag,
      rewire,
      panDrag,
      marquee,
      selectedNodeIds,
      selectedConnectionId,
    } = state;

    // Track container size for viewBox
    const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

    // Update container size on mount and resize
    useEffect(() => {
      const updateSize = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setContainerSize({ width: rect.width, height: rect.height });
        }
      };

      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Expose methods via ref for external control
    useImperativeHandle(
      ref,
      () => ({
        addNodeAtCenter: (type: string) => {
          // Calculate center of visible area
          const centerX = canvas.pan.x + containerSize.width / canvas.zoom / 2 - NODE.WIDTH / 2;
          const centerY =
            canvas.pan.y + containerSize.height / canvas.zoom / 2 - NODE.MIN_HEIGHT / 2;
          actions.addNode({ x: centerX, y: centerY }, type);
        },
        downloadWorkflow: (filename?: string) => {
          actions.downloadWorkflow(filename);
        },
        loadWorkflow: (data: WorkflowExport) => {
          return actions.loadWorkflow(data);
        },
        loadWorkflowFromFile: async (file: File) => {
          return await actions.loadWorkflowFromFile(file);
        },
        clearWorkflow: () => {
          actions.clearWorkflow();
        },
        getNodeCount: () => nodes.length,
        undo: () => {
          actions.undo();
        },
        redo: () => {
          actions.redo();
        },
        canUndo: () => actions.canUndo,
        canRedo: () => actions.canRedo,
      }),
      [canvas.pan, canvas.zoom, containerSize, actions, nodes.length]
    );

    // Handle drag-and-drop from node library
    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/workflow-node-type')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        const nodeType = e.dataTransfer.getData('application/workflow-node-type');
        if (!nodeType || !svgRef.current) return;

        e.preventDefault();
        const svgPoint = screenToSvg(svgRef.current, e.clientX, e.clientY);

        // Center the node at drop position
        const position = {
          x: svgPoint.x - NODE.WIDTH / 2,
          y: svgPoint.y - NODE.MIN_HEIGHT / 2,
        };

        actions.addNode(position, nodeType);
      },
      [actions]
    );

    // Compute viewBox from canvas state
    const viewBox = useMemo(() => {
      const width = containerSize.width / canvas.zoom;
      const height = containerSize.height / canvas.zoom;
      return `${canvas.pan.x} ${canvas.pan.y} ${width} ${height}`;
    }, [canvas.pan, canvas.zoom, containerSize]);

    // Compute connected port IDs for visual feedback
    const connectedPortIds = useMemo(() => {
      const ids = new Set<string>();
      connections.forEach((conn) => {
        ids.add(conn.fromPortId);
        ids.add(conn.toPortId);
      });
      return ids;
    }, [connections]);

    // Compute port IDs that belong to the selected connection (for orange highlight)
    const selectedConnectionPortIds = useMemo(() => {
      if (!selectedConnectionId) return new Set<string>();
      const conn = connections.find((c) => c.id === selectedConnectionId);
      if (!conn) return new Set<string>();
      return new Set([conn.fromPortId, conn.toPortId]);
    }, [selectedConnectionId, connections]);

    // Helper: Find all connections attached to a specific port
    const findConnectionsForPort = useCallback(
      (portId: string) => {
        return connections.filter((conn) => conn.fromPortId === portId || conn.toPortId === portId);
      },
      [connections]
    );

    // Get port position by port ID (defined early for use in startRewireFromConnection)
    const getPortPositionById = useCallback(
      (portId: string): Position | null => {
        for (const node of nodes) {
          // Check input ports
          const inputPort = node.inputPorts.find((p) => p.id === portId);
          if (inputPort) {
            return {
              x: node.position.x,
              y: node.position.y + NODE.PORT_TOP_MARGIN + inputPort.index * NODE.PORT_SPACING,
            };
          }

          // Check output ports
          const outputPort = node.outputPorts.find((p) => p.id === portId);
          if (outputPort) {
            return {
              x: node.position.x + NODE.WIDTH,
              y: node.position.y + NODE.PORT_TOP_MARGIN + outputPort.index * NODE.PORT_SPACING,
            };
          }
        }
        return null;
      },
      [nodes]
    );

    // Helper: Start rewiring a connection from a specific port
    // Handles determining which end is fixed vs moving and initializes rewire state
    const startRewireFromConnection = useCallback(
      (
        connection: { id: string; fromPortId: string; toPortId: string },
        clickedPortId: string,
        currentPosition: Position,
        shouldSelect: boolean = false
      ): boolean => {
        const isFromPort = connection.fromPortId === clickedPortId;
        const fixedPortId = isFromPort ? connection.toPortId : connection.fromPortId;
        const fixedPos = getPortPositionById(fixedPortId);

        if (!fixedPos) return false;

        if (shouldSelect) {
          actions.selectConnection(connection.id);
        }

        const movingEnd = isFromPort ? 'from' : 'to';
        actions.startRewire(connection.id, movingEnd, fixedPos, currentPosition);
        return true;
      },
      [getPortPositionById, actions]
    );

    // Handle mouse move for dragging (panning handled by window listener)
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!svgRef.current) return;

        // Panning is handled by window-level listeners for better UX
        if (panDrag.isPanning) return;

        const svgPoint = screenToSvg(svgRef.current, e.clientX, e.clientY);

        if (drag.isDragging) {
          actions.updateDrag(svgPoint);
        }

        if (connectionDrag.isDrawing) {
          actions.updateConnectionDrag(svgPoint);
        }

        if (rewire.isRewiring) {
          actions.updateRewire(svgPoint);
        }

        if (marquee.isSelecting) {
          actions.updateMarquee(svgPoint);
        }
      },
      [
        panDrag.isPanning,
        drag.isDragging,
        connectionDrag.isDrawing,
        rewire.isRewiring,
        marquee.isSelecting,
        actions,
      ]
    );

    // Helper: Find nodes that intersect with a rectangle
    const findNodesInRect = useCallback(
      (startPos: Position, endPos: Position): string[] => {
        const minX = Math.min(startPos.x, endPos.x);
        const maxX = Math.max(startPos.x, endPos.x);
        const minY = Math.min(startPos.y, endPos.y);
        const maxY = Math.max(startPos.y, endPos.y);

        return nodes
          .filter((node) => {
            const nodeHeight = calculateNodeHeight(node.inputPorts.length, node.outputPorts.length);
            const nodeRight = node.position.x + NODE.WIDTH;
            const nodeBottom = node.position.y + nodeHeight;

            // Check if node rectangle intersects with selection rectangle
            return (
              node.position.x < maxX &&
              nodeRight > minX &&
              node.position.y < maxY &&
              nodeBottom > minY
            );
          })
          .map((node) => node.id);
      },
      [nodes]
    );

    // Handle mouse up (panning handled by window listener)
    const handleMouseUp = useCallback(() => {
      // Panning is handled by window-level listeners
      if (drag.isDragging) {
        actions.endDrag();
      }
      if (connectionDrag.isDrawing) {
        actions.cancelConnection();
      }
      if (rewire.isRewiring) {
        actions.cancelRewire();
      }
      if (marquee.isSelecting && marquee.startPosition && marquee.currentPosition) {
        const nodesInRect = findNodesInRect(marquee.startPosition, marquee.currentPosition);
        actions.endMarquee(nodesInRect);
        // Set flag to prevent the subsequent click event from clearing selection
        justFinishedMarqueeRef.current = true;
      }
    }, [
      drag.isDragging,
      connectionDrag.isDrawing,
      rewire.isRewiring,
      marquee,
      findNodesInRect,
      actions,
    ]);

    // Handle mouse down for panning or marquee selection
    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent) => {
        // Middle mouse button (button 1) starts panning
        if (e.button === 1) {
          e.preventDefault();
          actions.startPan(canvas.pan, { x: e.clientX, y: e.clientY });
          return;
        }

        // Left mouse button on canvas background starts marquee selection
        if (e.button === 0 && svgRef.current) {
          const target = e.target as Element;
          const isCanvasBackground =
            target === svgRef.current || target.classList.contains('grid-background');

          if (isCanvasBackground) {
            const svgPoint = screenToSvg(svgRef.current, e.clientX, e.clientY);
            actions.startMarquee(svgPoint);
          }
        }
      },
      [canvas.pan, actions]
    );

    // Handle canvas click (deselect all)
    const handleCanvasClick = useCallback(
      (e: React.MouseEvent) => {
        // Don't deselect if we just finished panning or marquee selection
        if (panDrag.isPanning) return;

        // Check if we just finished marquee selection (click fires after mouseup)
        if (justFinishedMarqueeRef.current) {
          justFinishedMarqueeRef.current = false;
          return;
        }

        if (e.target === svgRef.current || (e.target as Element).closest('.grid-background')) {
          actions.clearNodeSelection();
          actions.selectConnection(null);
        }
      },
      [panDrag.isPanning, actions]
    );

    // Handle wheel for zooming
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        if (!svgRef.current) return;

        const svgPoint = screenToSvg(svgRef.current, e.clientX, e.clientY);
        const zoomDelta = e.deltaY > 0 ? -CANVAS.ZOOM_STEP : CANVAS.ZOOM_STEP;
        const newZoom = canvas.zoom + zoomDelta;

        actions.setZoom(newZoom, svgPoint);
      },
      [canvas.zoom, actions]
    );

    // Handle connection click
    const handleConnectionClick = useCallback(
      (e: React.MouseEvent, connectionId: string) => {
        e.stopPropagation();
        actions.selectConnection(connectionId);
      },
      [actions]
    );

    // Handle double-click to add node
    // Uses selectedNodeType from library, or modifier keys as shortcuts
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => {
        if (!svgRef.current) return;

        // Only allow double-click on canvas background (SVG or grid rect)
        const target = e.target as Element;
        const isCanvasBackground =
          target === svgRef.current || target.classList.contains('grid-background');
        if (!isCanvasBackground) return;

        const svgPoint = screenToSvg(svgRef.current, e.clientX, e.clientY);

        // Center the node at click position
        const position = {
          x: svgPoint.x - NODE.WIDTH / 2,
          y: svgPoint.y - NODE.MIN_HEIGHT / 2,
        };

        // Modifier keys override the selected type (shortcuts)
        let nodeType = selectedNodeType;
        if (e.shiftKey && e.altKey) {
          nodeType = 'end';
        } else if (e.shiftKey) {
          nodeType = 'condition';
        } else if (e.ctrlKey || e.metaKey) {
          nodeType = 'transform';
        } else if (e.altKey) {
          nodeType = 'start';
        }

        actions.addNode(position, nodeType);
      },
      [actions, selectedNodeType]
    );

    // Handle node mouse down (start drag)
    const handleNodeMouseDown = useCallback(
      (nodeId: string, event: React.MouseEvent) => {
        if (!svgRef.current) return;

        // Convert mouse position to SVG coordinates
        const svgPoint = screenToSvg(svgRef.current, event.clientX, event.clientY);

        // Find the node to get its current position
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        // Calculate offset in SVG coordinate space
        const offset = {
          x: svgPoint.x - node.position.x,
          y: svgPoint.y - node.position.y,
        };

        // Pass ctrl/meta key for multi-select behavior
        const ctrlKey = event.ctrlKey || event.metaKey;
        actions.startDrag(nodeId, offset, ctrlKey);
      },
      [nodes, actions]
    );

    // Handle port interactions
    const handlePortMouseDown = useCallback(
      (port: Port, position: Position) => {
        // Priority 1: If this port belongs to the selected connection, start rewiring
        if (selectedConnectionId) {
          const selectedConn = connections.find((c) => c.id === selectedConnectionId);
          if (selectedConn) {
            const belongsToSelected =
              selectedConn.fromPortId === port.id || selectedConn.toPortId === port.id;

            if (belongsToSelected) {
              startRewireFromConnection(selectedConn, port.id, position);
              return;
            }
          }
        }

        // Priority 2: If this is an input port with an existing connection, start rewiring that
        if (port.type === 'input') {
          const existingConnections = findConnectionsForPort(port.id);
          if (existingConnections.length > 0) {
            // Use the last connection (most recently added)
            const connection = existingConnections[existingConnections.length - 1];
            startRewireFromConnection(connection, port.id, position, true);
            return;
          }
        }

        // Default: Start a new connection
        actions.startConnection(port, position);
      },
      [
        selectedConnectionId,
        connections,
        findConnectionsForPort,
        startRewireFromConnection,
        actions,
      ]
    );

    const handlePortMouseUp = useCallback(
      (port: Port) => {
        if (connectionDrag.isDrawing) {
          actions.endConnection(port);
        }
        if (rewire.isRewiring) {
          actions.endRewire(port);
        }
      },
      [connectionDrag.isDrawing, rewire.isRewiring, actions]
    );

    // Handle double-click on port to start rewiring
    const handlePortDoubleClick = useCallback(
      (port: Port, position: Position) => {
        const portConnections = findConnectionsForPort(port.id);
        if (portConnections.length === 0) return;

        // Pick the last connection (most recently added)
        const connection = portConnections[portConnections.length - 1];
        startRewireFromConnection(connection, port.id, position, true);
      },
      [findConnectionsForPort, startRewireFromConnection]
    );

    // Attach window-level listeners for panning (allows dragging outside canvas)
    useEffect(() => {
      if (!panDrag.isPanning) return;

      const handleWindowMouseMove = (e: MouseEvent) => {
        actions.updatePan({ x: e.clientX, y: e.clientY });
      };

      const handleWindowMouseUp = () => {
        actions.endPan();
      };

      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
    }, [panDrag.isPanning, actions]);

    // Handle keyboard shortcuts
    const handleClearSelection = useCallback(() => {
      actions.clearNodeSelection();
      actions.selectConnection(null);
    }, [actions]);

    // Handle copy: write to system clipboard
    const handleCopyNodes = useCallback(() => {
      if (selectedNodeIds.length === 0) return;

      // Create clipboard data and write to system clipboard
      const clipboardData = createClipboardData(selectedNodeIds, nodes, connections);
      if (!clipboardData) return;

      writeToSystemClipboard(clipboardData);
    }, [selectedNodeIds, nodes, connections]);

    // Handle paste: read from system clipboard and create nodes
    const handlePasteNodes = useCallback(async () => {
      // Read from system clipboard
      const clipboardData = await readFromSystemClipboard();
      if (!clipboardData) return;

      // Calculate center of visible area
      const centerX = canvas.pan.x + containerSize.width / canvas.zoom / 2;
      const centerY = canvas.pan.y + containerSize.height / canvas.zoom / 2;
      // Add a small offset so pasted nodes don't overlap exactly
      const offset = { x: centerX + 20, y: centerY + 20 };

      actions.pasteNodes(clipboardData, offset);
    }, [canvas.pan, canvas.zoom, containerSize, actions]);

    useKeyboardShortcuts({
      selectedNodeIds,
      selectedConnectionId,
      isDrawingConnection: connectionDrag.isDrawing,
      isRewiring: rewire.isRewiring,
      isMarqueeSelecting: marquee.isSelecting,
      onDeleteNodes: actions.deleteNodes,
      onDeleteConnection: actions.deleteConnection,
      onCopyNodes: handleCopyNodes,
      onPasteNodes: handlePasteNodes,
      onCancelConnection: actions.cancelConnection,
      onCancelRewire: actions.cancelRewire,
      onCancelMarquee: actions.cancelMarquee,
      onClearSelection: handleClearSelection,
      onUndo: actions.undo,
      onRedo: actions.redo,
      canUndo: actions.canUndo,
      canRedo: actions.canRedo,
    });

    // Compute selected nodes for inspector
    const selectedNodes = useMemo(
      () => nodes.filter((n) => selectedNodeIds.includes(n.id)),
      [selectedNodeIds, nodes]
    );

    const selectedConnection = useMemo(
      () =>
        selectedConnectionId
          ? (connections.find((c) => c.id === selectedConnectionId) ?? null)
          : null,
      [selectedConnectionId, connections]
    );

    return (
      <div className="w-full h-full flex">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 h-full"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <svg
            ref={svgRef}
            className="w-full h-full bg-background"
            viewBox={viewBox}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleCanvasMouseDown}
            onClick={handleCanvasClick}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          >
            {/* Grid background */}
            <GridBackground pan={canvas.pan} />
            {/* Connections */}
            <ConnectionLines
              connections={connections}
              selectedConnectionId={selectedConnectionId}
              rewire={rewire}
              connectionDrag={connectionDrag}
              getPortPositionById={getPortPositionById}
              onConnectionClick={handleConnectionClick}
            />

            {/* Nodes */}
            <g className="nodes">
              {nodes.map((node) => (
                <WorkflowNodeComponent
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeIds.includes(node.id)}
                  connectedPortIds={connectedPortIds}
                  selectedConnectionPortIds={selectedConnectionPortIds}
                  onMouseDown={handleNodeMouseDown}
                  onPortMouseDown={handlePortMouseDown}
                  onPortMouseUp={handlePortMouseUp}
                  onPortDoubleClick={handlePortDoubleClick}
                />
              ))}
            </g>

            {/* Marquee selection rectangle */}
            <MarqueeRect marquee={marquee} />

            {/* Empty state hint */}
            {nodes.length === 0 && (
              <text
                x={canvas.pan.x + containerSize.width / canvas.zoom / 2}
                y={canvas.pan.y + containerSize.height / canvas.zoom / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-muted-foreground"
                fontSize={14}
              >
                Double-click to add a node
              </text>
            )}
          </svg>
        </div>

        {/* Inspector panel */}
        <InspectorPanel
          selectedNodes={selectedNodes}
          selectedConnection={selectedConnection}
          nodes={nodes}
          onUpdateNodeData={actions.updateNodeData}
          onDeleteNodes={actions.deleteNodes}
          onDeleteConnection={actions.deleteConnection}
        />
      </div>
    );
  }
);

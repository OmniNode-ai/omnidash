import { memo, useCallback, useState } from 'react';
import type { WorkflowNode as NodeType, Port, Position } from './models/types';
import { NODE, COLORS, calculateNodeHeight } from './models/constants';
import { getNodeTypeDefinition, DEFAULT_NODE_TYPE } from './models/nodeRegistry';

interface WorkflowNodeProps {
  node: NodeType;
  isSelected: boolean;
  connectedPortIds: Set<string>;
  selectedConnectionPortIds: Set<string>;
  onMouseDown: (nodeId: string, event: React.MouseEvent) => void;
  onPortMouseDown: (port: Port, position: Position) => void;
  onPortMouseUp: (port: Port) => void;
  onPortDoubleClick: (port: Port, position: Position) => void;
}

interface PortProps {
  port: Port;
  cx: number;
  cy: number;
  label: string;
  isInput: boolean;
  isConnected: boolean;
  isConnectionSelected: boolean;
  onMouseDown: (port: Port, position: Position) => void;
  onMouseUp: (port: Port) => void;
  onDoubleClick: (port: Port, position: Position) => void;
}

const PortComponent = memo(function PortComponent({
  port,
  cx,
  cy,
  label,
  isInput,
  isConnected,
  isConnectionSelected,
  onMouseDown,
  onMouseUp,
  onDoubleClick,
}: PortProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseDown(port, { x: cx, y: cy });
    },
    [port, cx, cy, onMouseDown]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMouseUp(port);
    },
    [port, onMouseUp]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick(port, { x: cx, y: cy });
    },
    [port, cx, cy, onDoubleClick]
  );

  // Priority: hover > connection selected > connected > default
  const fillColor = isHovered
    ? COLORS.port.hover
    : isConnectionSelected
      ? COLORS.port.hover
      : isConnected
        ? COLORS.port.connected
        : COLORS.port.default;

  // Label positioning based on port side
  const labelX = isInput ? cx + NODE.PORT_LABEL_OFFSET : cx - NODE.PORT_LABEL_OFFSET;
  const textAnchor = isInput ? 'start' : 'end';

  return (
    <g>
      {/* Larger invisible hitbox for easier clicking */}
      <circle
        cx={cx}
        cy={cy}
        r={NODE.PORT_HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      {/* Visible port circle */}
      <circle
        cx={cx}
        cy={cy}
        r={NODE.PORT_RADIUS}
        fill={fillColor}
        stroke="#1f2937"
        strokeWidth={2}
        style={{ pointerEvents: 'none', transition: 'fill 0.15s ease' }}
      />
      {/* Port label */}
      <text
        x={labelX}
        y={cy}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill="rgba(255, 255, 255, 0.8)"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
});

export const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  node,
  isSelected,
  connectedPortIds,
  selectedConnectionPortIds,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
  onPortDoubleClick,
}: WorkflowNodeProps) {
  const { position, type, inputPorts, outputPorts } = node;
  const { x, y } = position;

  // Get node type definition for color
  const typeDef = getNodeTypeDefinition(type) || DEFAULT_NODE_TYPE;

  // Calculate dynamic height based on port count
  const nodeHeight = calculateNodeHeight(inputPorts.length, outputPorts.length);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      e.stopPropagation();
      onMouseDown(node.id, e);
    },
    [node.id, onMouseDown]
  );

  // Calculate port position
  const getPortY = (index: number): number => {
    return y + NODE.PORT_TOP_MARGIN + index * NODE.PORT_SPACING;
  };

  return (
    <g style={{ cursor: 'grab' }}>
      {/* Node background */}
      <rect
        x={x}
        y={y}
        width={NODE.WIDTH}
        height={nodeHeight}
        rx={NODE.BORDER_RADIUS}
        ry={NODE.BORDER_RADIUS}
        fill={typeDef.color}
        stroke={isSelected ? '#ffffff' : 'transparent'}
        strokeWidth={isSelected ? 2 : 0}
        style={{
          filter: isSelected ? 'drop-shadow(0 0 8px rgba(255,255,255,0.3))' : undefined,
          transition: 'stroke 0.15s ease, filter 0.15s ease',
        }}
        onMouseDown={handleMouseDown}
      />

      {/* Node header/label */}
      <text
        x={x + NODE.WIDTH / 2}
        y={y + NODE.HEADER_HEIGHT / 2 + 4}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={12}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {typeDef.label}
      </text>

      {/* Header separator line */}
      <line
        x1={x + 8}
        y1={y + NODE.HEADER_HEIGHT}
        x2={x + NODE.WIDTH - 8}
        y2={y + NODE.HEADER_HEIGHT}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth={1}
      />

      {/* Input ports (left side) */}
      {inputPorts.map((port) => (
        <PortComponent
          key={port.id}
          port={port}
          cx={x}
          cy={getPortY(port.index)}
          label={port.name}
          isInput={true}
          isConnected={connectedPortIds.has(port.id)}
          isConnectionSelected={selectedConnectionPortIds.has(port.id)}
          onMouseDown={onPortMouseDown}
          onMouseUp={onPortMouseUp}
          onDoubleClick={onPortDoubleClick}
        />
      ))}

      {/* Output ports (right side) */}
      {outputPorts.map((port) => (
        <PortComponent
          key={port.id}
          port={port}
          cx={x + NODE.WIDTH}
          cy={getPortY(port.index)}
          label={port.name}
          isInput={false}
          isConnected={connectedPortIds.has(port.id)}
          isConnectionSelected={selectedConnectionPortIds.has(port.id)}
          onMouseDown={onPortMouseDown}
          onMouseUp={onPortMouseUp}
          onDoubleClick={onPortDoubleClick}
        />
      ))}
    </g>
  );
});

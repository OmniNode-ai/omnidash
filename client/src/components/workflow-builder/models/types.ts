// Core types for the workflow builder

export type PortType = 'input' | 'output';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Port {
  id: string;
  name: string;
  type: PortType;
  nodeId: string;
  index: number; // Position in the port array (0, 1, 2...)
  maxConnections?: number; // Max connections allowed (undefined = unlimited)
}

export interface Connection {
  id: string;
  fromPortId: string;
  toPortId: string;
  fromNodeId: string;
  toNodeId: string;
  /** Stores unknown fields from imported edge data for round-trip preservation */
  _extra?: Record<string, unknown>;
}

// Port definition for node types
export interface PortDefinition {
  name: string;
  description?: string;
  maxConnections?: number; // Max connections allowed (undefined = unlimited, 1 = single connection only)
}

// Config field types for the inspector
export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'select' | 'multiline' | 'json';

export interface ConfigFieldBase {
  name: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  required?: boolean;
}

export interface StringField extends ConfigFieldBase {
  type: 'string';
  default?: string;
  placeholder?: string;
}

export interface NumberField extends ConfigFieldBase {
  type: 'number';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanField extends ConfigFieldBase {
  type: 'boolean';
  default?: boolean;
}

export interface SelectField extends ConfigFieldBase {
  type: 'select';
  default?: string;
  options: { value: string; label: string }[];
}

export interface MultilineField extends ConfigFieldBase {
  type: 'multiline';
  default?: string;
  placeholder?: string;
  rows?: number;
}

export interface JsonField extends ConfigFieldBase {
  type: 'json';
  default?: unknown;
  rows?: number;
}

export type ConfigField =
  | StringField
  | NumberField
  | BooleanField
  | SelectField
  | MultilineField
  | JsonField;

// Static definition of a node type (from registry)
export interface NodeTypeDefinition {
  type: string;
  label: string;
  color: string;
  icon?: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  description?: string;
  configFields?: ConfigField[];
  docsUrl?: string; // External documentation URL
}

// Runtime instance of a node
export interface WorkflowNode {
  id: string;
  type: string;
  position: Position;
  data: Record<string, unknown>;
  inputPorts: Port[];
  outputPorts: Port[];
  /** Stores unknown fields from imported data for round-trip preservation */
  _extra?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Connection[];
}

// Canvas state for interactions
export interface CanvasState {
  pan: Position;
  zoom: number;
}

// Drag state
export interface DragState {
  isDragging: boolean;
  nodeId: string | null; // Primary node being dragged (for offset calculation)
  startPosition: Position | null;
  offset: Position | null;
  nodeStartPositions: Record<string, Position>; // Starting positions of all dragged nodes
}

// Connection drawing state
export interface ConnectionDragState {
  isDrawing: boolean;
  startPort: Port | null;
  startPosition: Position | null;
  currentPosition: Position | null;
}

// Connection rewiring state (moving an endpoint)
export interface RewireState {
  isRewiring: boolean;
  connectionId: string | null;
  movingEnd: 'from' | 'to' | null; // Which end is being moved
  fixedPortPosition: Position | null; // The end that stays fixed
  currentPosition: Position | null; // Where the moving end is now
}

// Canvas panning state
export interface PanDragState {
  isPanning: boolean;
  startPan: Position | null; // Pan position when drag started
  startMouse: Position | null; // Mouse position when drag started
}

// Marquee selection state
export interface MarqueeState {
  isSelecting: boolean;
  startPosition: Position | null;
  currentPosition: Position | null;
}

// Clipboard data for copy/paste (portable JSON format)
export interface ClipboardNode {
  clipboardIndex: number; // Temporary reference within clipboard
  type: string;
  relativePosition: Position; // Relative to selection center
  data: Record<string, unknown>;
  inputPortCount: number;
  outputPortCount: number;
}

export interface ClipboardConnection {
  fromNodeIndex: number; // References clipboardIndex
  fromPortIndex: number; // Port array index (0, 1, 2...)
  toNodeIndex: number;
  toPortIndex: number;
}

export interface ClipboardData {
  version: string;
  nodes: ClipboardNode[];
  connections: ClipboardConnection[];
}

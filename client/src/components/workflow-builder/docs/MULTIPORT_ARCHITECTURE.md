# Multi-Port Node Architecture

This document describes the multi-port implementation patterns learned from the tinybonsai codebase, adapted for our React/TypeScript workflow builder.

## Overview

The tinybonsai project implements a Qt-based node graph editor with support for multiple input/output ports per node. This document captures the key architectural decisions that make that system work well.

## Core Concepts

### 1. Port Identity Model

Each port needs:
- **Name**: Human-readable label (e.g., "GAT", "OUTPUT")
- **Index**: Position in the port array (0, 1, 2...)
- **Direction**: Input or output (boolean `isInput`)
- **Connection count**: Track how many connections attach to this port

```typescript
interface Port {
  id: string;
  name: string;
  index: number;
  type: 'input' | 'output';
  nodeId: string;
}
```

### 2. Node Definition vs Node Instance

**Separation of concerns:**

| Concept | Purpose | Example |
|---------|---------|---------|
| **NodeTypeDefinition** | Static template defining what ports a node type has | "ADSR has inputs: [GAT, RET], outputs: [OUTPUT]" |
| **WorkflowNode** | Runtime instance with actual port objects | Node "adsr-123" at position (100, 200) |

```typescript
// Static definition (from registry)
interface NodeTypeDefinition {
  type: string;
  label: string;
  inputs: string[];   // Port names: ["GAT", "RET"]
  outputs: string[];  // Port names: ["OUTPUT"]
  color: string;
}

// Runtime instance
interface WorkflowNode {
  id: string;
  type: string;
  position: Position;
  inputPorts: Port[];   // Created from definition
  outputPorts: Port[];
  data: Record<string, unknown>;
}
```

### 3. Connection Model

Connections reference specific ports by ID, not just nodes:

```typescript
interface Connection {
  id: string;
  fromNodeId: string;
  fromPortId: string;   // Specific output port
  toNodeId: string;
  toPortId: string;     // Specific input port
}
```

**Key insight**: Using port IDs (not indices) makes the system resilient to port reordering.

### 4. Port Positioning Algorithm

Ports are stacked vertically along the node edges:

```
┌─────────────────────┐
│  [in0]    Label     │
│  [in1]              │
│  [in2]     [out0]   │
│            [out1]   │
└─────────────────────┘
```

**Positioning formula:**
```typescript
const PORT_SPACING = 20;
const TOP_MARGIN = 30;

function getPortY(index: number): number {
  return TOP_MARGIN + index * PORT_SPACING;
}

function getPortX(type: 'input' | 'output', nodeWidth: number): number {
  return type === 'input' ? 0 : nodeWidth;
}
```

**Dynamic height**: Node height adjusts based on max(inputCount, outputCount):
```typescript
function calculateNodeHeight(inputs: number, outputs: number): number {
  const maxPorts = Math.max(inputs, outputs);
  return TOP_MARGIN * 2 + maxPorts * PORT_SPACING;
}
```

### 5. Connection Validation Rules

| Rule | Description |
|------|-------------|
| Direction | Output → Input only (never input→input or output→output) |
| Self-connection | Cannot connect a node to itself |
| Duplicate | Cannot create the same connection twice |
| Single input (optional) | Input ports may accept only one connection |

```typescript
function canConnect(fromPort: Port, toPort: Port): boolean {
  // Must be output → input
  if (fromPort.type !== 'output' || toPort.type !== 'input') return false;

  // Cannot self-connect
  if (fromPort.nodeId === toPort.nodeId) return false;

  // Check for existing connection (if single-input enforced)
  // ...

  return true;
}
```

### 6. Hitbox Design

**Visual vs Interactive regions:**
- Visual port: Small square (10x10px)
- Hit region: Larger circle (15px radius)

This makes ports easier to click while keeping visuals compact.

```typescript
const PORT_VISUAL_RADIUS = 5;
const PORT_HIT_RADIUS = 12;
```

### 7. Serialization Format

For persistence, connections use indices (more compact) but port IDs work too:

```json
{
  "nodes": [
    {
      "id": "node-123",
      "type": "adsr",
      "position": { "x": 100, "y": 200 },
      "data": {}
    }
  ],
  "connections": [
    {
      "id": "conn-456",
      "from": { "nodeId": "node-123", "portIndex": 0 },
      "to": { "nodeId": "node-789", "portIndex": 1 }
    }
  ]
}
```

## Implementation Strategy for React/SVG

### Phase 1: Update Type System

1. Change `WorkflowNode` to have `inputPorts: Port[]` and `outputPorts: Port[]`
2. Update `Connection` to include `fromPortId` and `toPortId`
3. Create `NodeTypeDefinition` registry with port definitions

### Phase 2: Update Node Creation

1. When creating a node, look up its `NodeTypeDefinition`
2. Generate `Port` objects for each input/output name
3. Assign sequential indices and unique IDs

### Phase 3: Update Rendering

1. Calculate node height dynamically based on port count
2. Render ports in vertical stacks on left (inputs) and right (outputs)
3. Position connection endpoints at specific port locations

### Phase 4: Update Connection Logic

1. Track which specific port the user clicked
2. Validate connections use correct port types
3. Draw connection lines to exact port positions

## Visual Design

```
┌──────────────────────────────┐
│         ADSR Envelope        │  ← Header with type label
├──────────────────────────────┤
│ ○ GAT                        │  ← Input port with label
│ ○ RET              OUTPUT ○  │  ← Mixed row
│                              │
└──────────────────────────────┘
     ↑                    ↑
   Inputs              Outputs
  (left edge)        (right edge)
```

## Key Lessons from Tinybonsai

1. **Ports are first-class objects** - Not just positions, but entities with state
2. **Index-based identification** - Efficient for serialization
3. **Dynamic sizing** - Nodes grow to fit their ports
4. **Large hit regions** - Better UX with generous click targets
5. **Connection counter** - Track port utilization for visual feedback
6. **Validation at UI level** - Prevent invalid connections before they're created

## References

- Original implementation: `C:\Code\tinybonsai`
- Key files: `port.h/cpp`, `module.h/cpp`, `connection.h/cpp`, `nodecanvas.cpp`

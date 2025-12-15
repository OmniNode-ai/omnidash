// Visual constants for the workflow builder

export const NODE = {
  WIDTH: 160,
  MIN_HEIGHT: 50,
  HEADER_HEIGHT: 28,
  BORDER_RADIUS: 8,
  PORT_RADIUS: 6,
  PORT_HIT_RADIUS: 12, // Larger hitbox for easier clicking
  PORT_SPACING: 22, // Vertical spacing between ports
  PORT_TOP_MARGIN: 36, // Distance from top of node to first port
  PORT_LABEL_OFFSET: 14, // Horizontal offset for port labels
} as const;

// Calculate node height based on port count
export function calculateNodeHeight(inputCount: number, outputCount: number): number {
  const maxPorts = Math.max(inputCount, outputCount, 1);
  return NODE.PORT_TOP_MARGIN + maxPorts * NODE.PORT_SPACING;
}

export const CANVAS = {
  MIN_ZOOM: 0.25,
  MAX_ZOOM: 2,
  ZOOM_STEP: 0.1,
  GRID_SIZE: 20,
} as const;

export const COLORS = {
  port: {
    default: '#6b7280',
    connected: '#22c55e',
    hover: '#f97316',
    drawing: '#3b82f6',
  },
  connection: {
    default: '#6b7280',
    hover: '#3b82f6',
    selected: '#8b5cf6',
  },
  grid: {
    line: 'rgba(255, 255, 255, 0.05)',
    lineDark: 'rgba(0, 0, 0, 0.05)',
  },
} as const;

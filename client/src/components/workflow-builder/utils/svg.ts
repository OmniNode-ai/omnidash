import type { Position } from '../models/types';

/**
 * Convert screen coordinates to SVG viewport coordinates
 */
export function screenToSvg(svgElement: SVGSVGElement, clientX: number, clientY: number): Position {
  const point = svgElement.createSVGPoint();
  point.x = clientX;
  point.y = clientY;

  const ctm = svgElement.getScreenCTM();
  if (!ctm) {
    return { x: clientX, y: clientY };
  }

  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

/**
 * Generate a cubic bezier path between two points
 * Creates a smooth horizontal S-curve for left/right port connections
 * Output ports are on the right, input ports are on the left
 */
export function createConnectionPath(from: Position, to: Position): string {
  // Horizontal distance affects curve intensity
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

  // Control point offset - curves outward horizontally
  // Minimum offset ensures nice curves even for close nodes
  const controlOffset = Math.max(dx * 0.5, 50);

  // Bezier control points extend horizontally from each endpoint
  // From point (output): control point goes right (+X)
  // To point (input): control point goes left (-X from the to point's perspective)
  return `M ${from.x} ${from.y}
          C ${from.x + controlOffset} ${from.y},
            ${to.x - controlOffset} ${to.y},
            ${to.x} ${to.y}`;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Snap position to grid
 */
export function snapToGrid(position: Position, gridSize: number): Position {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

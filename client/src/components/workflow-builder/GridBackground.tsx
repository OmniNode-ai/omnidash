import { memo } from 'react';
import { CANVAS, COLORS } from './models/constants';
import type { Position } from './models/types';

interface GridBackgroundProps {
  pan: Position;
}

/**
 * SVG grid pattern and background for the workflow canvas.
 * Renders an "infinite" grid that follows the pan position.
 */
export const GridBackground = memo(function GridBackground({ pan }: GridBackgroundProps) {
  return (
    <>
      {/* Grid pattern definition */}
      <defs>
        <pattern
          id="grid-pattern"
          width={CANVAS.GRID_SIZE}
          height={CANVAS.GRID_SIZE}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${CANVAS.GRID_SIZE} 0 L 0 0 0 ${CANVAS.GRID_SIZE}`}
            fill="none"
            stroke={COLORS.grid.line}
            strokeWidth={1}
          />
        </pattern>
      </defs>

      {/* Infinite grid background */}
      <rect
        x={pan.x - 5000}
        y={pan.y - 5000}
        width={10000}
        height={10000}
        fill="url(#grid-pattern)"
        className="grid-background"
      />
    </>
  );
});

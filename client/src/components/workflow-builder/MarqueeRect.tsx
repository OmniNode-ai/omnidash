import { memo, useMemo } from 'react';
import type { MarqueeState } from './models/types';

interface MarqueeRectProps {
  marquee: MarqueeState;
}

/**
 * Renders a selection rectangle (marquee) during drag selection.
 * The rectangle is drawn from startPosition to currentPosition.
 */
export const MarqueeRect = memo(function MarqueeRect({ marquee }: MarqueeRectProps) {
  const { isSelecting, startPosition, currentPosition } = marquee;

  const rect = useMemo(() => {
    if (!isSelecting || !startPosition || !currentPosition) return null;

    // Calculate rectangle bounds (handle negative width/height)
    const x = Math.min(startPosition.x, currentPosition.x);
    const y = Math.min(startPosition.y, currentPosition.y);
    const width = Math.abs(currentPosition.x - startPosition.x);
    const height = Math.abs(currentPosition.y - startPosition.y);

    return { x, y, width, height };
  }, [isSelecting, startPosition, currentPosition]);

  if (!rect) return null;

  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      className="fill-primary/10 stroke-primary stroke-1"
      strokeDasharray="4 2"
      pointerEvents="none"
    />
  );
});

import { memo } from 'react';
import { createConnectionPath } from './utils/svg';
import { COLORS } from './models/constants';
import type { Connection, Position, RewireState, ConnectionDragState } from './models/types';

interface ConnectionLinesProps {
  connections: Connection[];
  selectedConnectionId: string | null;
  rewire: RewireState;
  connectionDrag: ConnectionDragState;
  getPortPositionById: (portId: string) => Position | null;
  onConnectionClick: (e: React.MouseEvent, connectionId: string) => void;
}

export const ConnectionLines = memo(function ConnectionLines({
  connections,
  selectedConnectionId,
  rewire,
  connectionDrag,
  getPortPositionById,
  onConnectionClick,
}: ConnectionLinesProps) {
  return (
    <g className="connections">
      {/* Existing connections */}
      {connections.map((conn) => {
        // Hide connection being rewired (we'll draw it separately)
        if (rewire.isRewiring && conn.id === rewire.connectionId) {
          return null;
        }

        const fromPos = getPortPositionById(conn.fromPortId);
        const toPos = getPortPositionById(conn.toPortId);
        if (!fromPos || !toPos) return null;

        const isSelected = conn.id === selectedConnectionId;
        const pathD = createConnectionPath(fromPos, toPos);

        return (
          <g key={conn.id}>
            {/* Invisible wider hitbox for easier clicking */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              strokeLinecap="round"
              style={{ cursor: 'pointer' }}
              onClick={(e) => onConnectionClick(e, conn.id)}
            />
            {/* Visible connection line */}
            <path
              d={pathD}
              fill="none"
              stroke={isSelected ? COLORS.port.hover : COLORS.connection.default}
              strokeWidth={isSelected ? 2.5 : 2}
              strokeLinecap="round"
              style={{
                transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
                pointerEvents: 'none',
              }}
            />
          </g>
        );
      })}

      {/* Active connection being drawn */}
      {connectionDrag.isDrawing &&
        connectionDrag.startPosition &&
        connectionDrag.currentPosition && (
          <path
            d={createConnectionPath(connectionDrag.startPosition, connectionDrag.currentPosition)}
            fill="none"
            stroke={COLORS.port.drawing}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="5,5"
          />
        )}

      {/* Connection being rewired */}
      {rewire.isRewiring && rewire.fixedPortPosition && rewire.currentPosition && (
        <path
          d={
            rewire.movingEnd === 'from'
              ? createConnectionPath(rewire.currentPosition, rewire.fixedPortPosition)
              : createConnectionPath(rewire.fixedPortPosition, rewire.currentPosition)
          }
          fill="none"
          stroke={COLORS.port.hover}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="5,5"
        />
      )}
    </g>
  );
});

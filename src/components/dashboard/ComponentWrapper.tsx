// SOURCE: Claude Design prototype
//   Styling: OmniDash.html:279-360 (.widget, .widget-head, .widget-title, .widget-live, .widget-body)
//            — ported verbatim to src/styles/dashboard.css
//   React:   app.jsx:587-617 (WidgetCard chrome) + app.jsx:264-285 (widget kebab menu)
// Deviations from source:
//   - Widget "Live" badge gated on `isLive` prop (prototype ties it to real-time streams
//     like requests/logs/regions, not every widget).
//   - Kebab menu renders when `WidgetChromeContext` supplies any of onConfigure,
//     onDuplicate, onDelete — each item renders only if its handler is provided. Available
//     in both view and edit modes; click-widget-to-configure is no longer used.
//   - Uses `PositionedMenu` (prototype pattern) rather than a third-party dropdown
//     primitive, so the markup and behavior match the prototype 1:1.
import { useRef, type ReactNode, type DragEvent, type MouseEvent } from 'react';
import { GripVertical, MoreVertical, Settings, Copy, Trash2 } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { useWidgetChrome } from './WidgetChromeContext';
import { Text } from '@/components/ui/typography';

interface ComponentWrapperProps {
  title: string;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  isLive?: boolean;
  children: ReactNode;
}

export function ComponentWrapper({
  title,
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  emptyHint,
  isLive = false,
  children,
}: ComponentWrapperProps) {
  const chrome = useWidgetChrome();
  const { onConfigure, onDuplicate, onDelete, draggable, isDragging, isDropTarget,
    onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = chrome;
  const hasMenu = Boolean(onConfigure || onDuplicate || onDelete);
  const menu = usePositionedMenu();

  const widgetClass = [
    'widget',
    isDragging && 'dragging',
    isDropTarget && 'drop-target',
  ].filter(Boolean).join(' ');

  // HTML5 drag is initiated by the browser on mousedown → mousemove on any
  // draggable ancestor, regardless of which child the mouse was on. Interactive
  // widget content (3D canvases, charts with their own pan/zoom) needs a way
  // to veto this so their own pointer handlers can run. Convention:
  //   - Mark the interactive region with `data-drag-exclude="true"`.
  //   - Before the browser fires dragstart it fires mousedown; we record
  //     whether mousedown landed inside an excluded region. In dragstart we
  //     `preventDefault()` to cancel the drag if so.
  const dragBlockedRef = useRef(false);
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    dragBlockedRef.current = Boolean(target?.closest('[data-drag-exclude]'));
  };
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (dragBlockedRef.current) {
      e.preventDefault();
      return;
    }
    onDragStart?.(e);
  };

  return (
    <div
      className={widgetClass}
      draggable={draggable || undefined}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="widget-head">
        <div className="widget-head-left">
          {draggable && (
            <span className="widget-grip" aria-hidden="true">
              <GripVertical size={14} />
            </span>
          )}
          <span className="widget-title">{title}</span>
        </div>
        <div className="widget-head-right">
          {isLive && <span className="widget-live">Live</span>}
          {hasMenu && (
            <>
              <button
                className="widget-kebab"
                aria-label={`${title} options`}
                type="button"
                onClick={menu.open}
              >
                <MoreVertical size={16} />
              </button>
              {menu.isOpen && (
                <PositionedMenu anchor={menu.anchor} onClose={menu.close} placement="bottom-end">
                  {onConfigure && (
                    <MenuItem onSelect={menu.select(onConfigure)}>
                      <Settings size={14} /> Configure Widget
                    </MenuItem>
                  )}
                  {onDuplicate && (
                    <MenuItem onSelect={menu.select(onDuplicate)}>
                      <Copy size={14} /> Duplicate
                    </MenuItem>
                  )}
                  {(onConfigure || onDuplicate) && onDelete && <MenuSeparator />}
                  {onDelete && (
                    <MenuItem variant="danger" onSelect={menu.select(onDelete)}>
                      <Trash2 size={14} /> Remove Widget
                    </MenuItem>
                  )}
                </PositionedMenu>
              )}
            </>
          )}
        </div>
      </div>
      <div className="widget-body">
        {isLoading && <Text as="div" size="lg" color="tertiary">Loading...</Text>}
        {error && !isLoading && (
          <Text as="div" size="lg" color="bad">Error: {error.message}</Text>
        )}
        {!isLoading && !error && isEmpty && (
          <Text as="div" size="lg" color="tertiary">
            <div>{emptyMessage || 'No data available'}</div>
            {emptyHint && (
              <div style={{ marginTop: 4 }}>
                <Text as="span" size="md" color="tertiary">{emptyHint}</Text>
              </div>
            )}
          </Text>
        )}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </div>
  );
}

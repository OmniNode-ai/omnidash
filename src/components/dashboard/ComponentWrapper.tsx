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
import type { ReactNode } from 'react';
import { MoreVertical, Settings, Copy, Trash2 } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { useWidgetChrome } from './WidgetChromeContext';

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
  const { onConfigure, onDuplicate, onDelete } = useWidgetChrome();
  const hasMenu = Boolean(onConfigure || onDuplicate || onDelete);
  const menu = usePositionedMenu();

  return (
    <div className="widget">
      <div className="widget-head">
        <div className="widget-head-left">
          <span className="widget-title">{title}</span>
        </div>
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
      <div className="widget-body">
        {isLoading && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading...</div>}
        {error && !isLoading && (
          <div style={{ color: 'var(--status-bad)', fontSize: 13 }}>Error: {error.message}</div>
        )}
        {!isLoading && !error && isEmpty && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>
            <div>{emptyMessage || 'No data available'}</div>
            {emptyHint && <div style={{ marginTop: 4, fontSize: 12 }}>{emptyHint}</div>}
          </div>
        )}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </div>
  );
}

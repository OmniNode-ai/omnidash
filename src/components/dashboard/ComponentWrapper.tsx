// SOURCE: Claude Design prototype
//   Styling: OmniDash.html:279-360 (.widget, .widget-head, .widget-title, .widget-live, .widget-body)
//            — ported verbatim to src/styles/dashboard.css
//   React:   app.jsx:587-617 (WidgetCard chrome)
// Deviations from source:
//   - OMN-47 follow-up: was using vanilla-extract ComponentWrapper.css; now uses prototype
//     semantic class names (.widget / .widget-head / .widget-body) from dashboard.css.
//   - Widget "Live" badge gated on `isLive` prop (prototype ties it to real-time streams
//     like requests/logs/regions, not every widget).
//   - Post-OMN-48 #14: kebab menu (MoreVertical) renders in the widget head when
//     `WidgetChromeContext` supplies onConfigure/onDelete handlers. Available in both
//     view and edit modes; click-widget-to-configure is no longer used.
import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const { onConfigure, onDelete } = useWidgetChrome();
  const hasMenu = Boolean(onConfigure || onDelete);

  return (
    <div className="widget">
      <div className="widget-head">
        <div className="widget-head-left">
          <span className="widget-title">{title}</span>
        </div>
        {isLive && <span className="widget-live">Live</span>}
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="widget-kebab"
                aria-label={`${title} options`}
                type="button"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="end"
              className="w-36"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {onConfigure && (
                <DropdownMenuItem onSelect={() => onConfigure()}>Configure</DropdownMenuItem>
              )}
              {onConfigure && onDelete && <DropdownMenuSeparator />}
              {onDelete && (
                <DropdownMenuItem
                  onSelect={() => onDelete()}
                  className="text-destructive focus:text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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

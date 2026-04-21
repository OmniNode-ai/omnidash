// SOURCE: Claude Design prototype
//   Styling: OmniDash.html:279-360 (.widget, .widget-head, .widget-title, .widget-live, .widget-body)
//            — ported verbatim to src/styles/dashboard.css
//   React:   app.jsx:587-617 (WidgetCard chrome)
// Deviations from source:
//   - OMN-47 follow-up: was using vanilla-extract ComponentWrapper.css; now uses prototype
//     semantic class names (.widget / .widget-head / .widget-body) from dashboard.css.
//   - Widget "Live" badge now gated on `isLive` prop (OMN-48 fix: prototype ties it to
//     real-time streams like requests/logs/regions, not every widget).
//   - Grip handle and kebab menu omitted at this layer — OMN-44 handles drag; menu lives
//     in the outer shell (ComponentCell) and will be wired in a later pass.
//   - Loading / error / empty states render inside the widget body; kept minimal for now.
import type { ReactNode } from 'react';

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
  return (
    <div className="widget">
      <div className="widget-head">
        <div className="widget-head-left">
          <span className="widget-title">{title}</span>
        </div>
        {isLive && <span className="widget-live">Live</span>}
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

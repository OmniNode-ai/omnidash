import { Suspense, useMemo, type LazyExoticComponent, type ComponentType } from 'react';
import { WidgetChromeContext, type WidgetChromeHandlers } from './WidgetChromeContext';

interface ComponentCellProps {
  componentName: string;
  config: Record<string, unknown>;
  component?: LazyExoticComponent<ComponentType<any>>;
  emptyMessage?: string;
  /** Called when the widget's kebab-menu "Configure Widget" item is selected. */
  onConfigure?: () => void;
  /** Called when the widget's kebab-menu "Duplicate" item is selected. */
  onDuplicate?: () => void;
  /** Called when the widget's kebab-menu "Remove Widget" item is selected. */
  onDelete?: () => void;
}

export function ComponentCell({
  componentName,
  config,
  component: LazyComponent,
  onConfigure,
  onDuplicate,
  onDelete,
}: ComponentCellProps) {
  const chrome = useMemo<WidgetChromeHandlers>(
    () => ({ onConfigure, onDuplicate, onDelete }),
    [onConfigure, onDuplicate, onDelete],
  );

  if (!LazyComponent) {
    // Fallback path keeps its wrapper — it has no ComponentWrapper to provide
    // widget chrome, so this div is what the user sees.
    return (
      <div
        data-testid="grid-item"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', opacity: 0.5, border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}
      >
        <span>{componentName} — not available</span>
      </div>
    );
  }

  // Normal path: a thin wrapper with `display: contents` holds the grid-item
  // testid and the chrome context provider without introducing a visible DOM
  // box between .dash-grid and .widget (which would create a new block
  // formatting context and break CSS columns flow).
  return (
    <WidgetChromeContext.Provider value={chrome}>
      <div data-testid="grid-item" style={{ display: 'contents' }}>
        <Suspense fallback={<div style={{ padding: '1rem', color: 'var(--ink-3)' }}>Loading {componentName}…</div>}>
          <LazyComponent config={config} />
        </Suspense>
      </div>
    </WidgetChromeContext.Provider>
  );
}

import { Suspense, useMemo, type LazyExoticComponent, type ComponentType } from 'react';
import { WidgetChromeContext, type WidgetChromeHandlers } from './WidgetChromeContext';

interface ComponentCellProps {
  componentName: string;
  config: Record<string, unknown>;
  component?: LazyExoticComponent<ComponentType<any>>;
  emptyMessage?: string;
  /** Called when the widget's kebab-menu "Configure" item is selected. */
  onConfigure?: () => void;
  /** Called when the widget's kebab-menu "Delete" item is selected. */
  onDelete?: () => void;
}

export function ComponentCell({
  componentName,
  config,
  component: LazyComponent,
  onConfigure,
  onDelete,
}: ComponentCellProps) {
  const chrome = useMemo<WidgetChromeHandlers>(() => ({ onConfigure, onDelete }), [onConfigure, onDelete]);

  if (!LazyComponent) {
    // Fallback path keeps its wrapper — it has no ComponentWrapper to provide
    // widget chrome, so this div is what the user sees.
    return (
      <div data-testid="grid-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', opacity: 0.5, border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}>
        <span>{componentName} — not available</span>
      </div>
    );
  }

  // Normal path: no extra wrapper div. The LazyComponent renders its own
  // <ComponentWrapper> which produces a <div class="widget">. That widget
  // div becomes the direct child of .dash-grid in the normal flow — important
  // for CSS columns layout, where an intervening wrapper with
  // `overflow: hidden` creates a new block formatting context that
  // prevents the child from flowing into columns properly.
  return (
    <WidgetChromeContext.Provider value={chrome}>
      <Suspense fallback={<div style={{ padding: '1rem', color: 'var(--ink-3)' }}>Loading {componentName}…</div>}>
        <LazyComponent config={config} />
      </Suspense>
    </WidgetChromeContext.Provider>
  );
}

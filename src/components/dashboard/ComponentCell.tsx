import { Suspense, useMemo, type DragEvent, type LazyExoticComponent, type ComponentType } from 'react';
import { WidgetChromeContext, type WidgetChromeHandlers } from './WidgetChromeContext';
import { Text } from '@/components/ui/typography';

interface ComponentCellProps {
  componentName: string;
  config: Record<string, unknown>;
  component?: LazyExoticComponent<ComponentType<any>>;
  /**
   * Override text shown when the lazy component for `componentName` cannot be
   * resolved (e.g. an external plugin widget is in the registry but its
   * package isn't installed). Defaults to "<componentName> — not available".
   * Plugin authors / hosts can supply a friendlier message such as
   * "Install @omninode/foo to enable this widget".
   */
  emptyMessage?: string;
  /** Called when the widget's kebab-menu "Configure Widget" item is selected. */
  onConfigure?: () => void;
  /** Called when the widget's kebab-menu "Duplicate" item is selected. */
  onDuplicate?: () => void;
  /** Called when the widget's kebab-menu "Remove Widget" item is selected. */
  onDelete?: () => void;
  /** When true, the widget root advertises itself as an HTML5 drag source. */
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}

export function ComponentCell({
  componentName,
  config,
  component: LazyComponent,
  emptyMessage,
  onConfigure,
  onDuplicate,
  onDelete,
  draggable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ComponentCellProps) {
  const chrome = useMemo<WidgetChromeHandlers>(
    () => ({
      onConfigure,
      onDuplicate,
      onDelete,
      draggable,
      isDragging,
      isDropTarget,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
    }),
    [onConfigure, onDuplicate, onDelete, draggable, isDragging, isDropTarget,
      onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop],
  );

  if (!LazyComponent) {
    return (
      <div
        data-testid="grid-item"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', opacity: 0.5, border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}
      >
        <span>{emptyMessage ?? `${componentName} — not available`}</span>
      </div>
    );
  }

  // `display: contents` holds the grid-item testid and the chrome context
  // provider without introducing a visible DOM box between .dash-grid and
  // .widget (which would break CSS columns flow).
  return (
    <WidgetChromeContext.Provider value={chrome}>
      <div data-testid="grid-item" style={{ display: 'contents' }}>
        <Suspense fallback={<Text as="div" color="tertiary" style={{ padding: '1rem' }}>Loading {componentName}…</Text>}>
          <LazyComponent config={config} />
        </Suspense>
      </div>
    </WidgetChromeContext.Provider>
  );
}

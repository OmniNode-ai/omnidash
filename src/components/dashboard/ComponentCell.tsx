import { Suspense, useMemo, type DragEvent, type LazyExoticComponent, type ComponentType } from 'react';
import { WidgetChromeContext, type WidgetChromeHandlers } from './WidgetChromeContext';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';
import { Text } from '@/components/ui/typography';
import type { ComponentAuthorityLabel } from '@shared/types/component-manifest';

interface ComponentCellProps {
  componentName: string;
  config: Record<string, unknown>;
  component?: LazyExoticComponent<ComponentType<any>>;
  authorityLabel?: ComponentAuthorityLabel;
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
  authorityLabel,
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
      authorityLabel,
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
    [authorityLabel, onConfigure, onDuplicate, onDelete, draggable, isDragging, isDropTarget,
      onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop],
  );

  if (!LazyComponent) {
    return (
      <div
        data-testid="grid-item"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', opacity: 0.5, border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)' }}
      >
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
          {authorityLabel && (
            <Text
              as="span"
              size="xs"
              family="mono"
              color={authorityLabel === 'hidden' ? 'bad' : 'tertiary'}
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: 'color-mix(in srgb, currentColor 10%, transparent)',
                border: '1px solid color-mix(in srgb, currentColor 28%, transparent)',
              }}
            >
              {authorityLabel}
            </Text>
          )}
          <span>{emptyMessage ?? `${componentName} — not available`}</span>
        </div>
      </div>
    );
  }

  // `display: contents` holds the grid-item testid and the chrome context
  // provider without introducing a visible DOM box between .dash-grid and
  // .widget (which would break CSS columns flow).
  return (
    <WidgetChromeContext.Provider value={chrome}>
      <div data-testid="grid-item" style={{ display: 'contents' }}>
        <WidgetErrorBoundary componentName={componentName} onRemove={onDelete}>
          <Suspense fallback={<Text as="div" color="tertiary" style={{ padding: '1rem' }}>Loading {componentName}…</Text>}>
            <LazyComponent config={config} />
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </WidgetChromeContext.Provider>
  );
}

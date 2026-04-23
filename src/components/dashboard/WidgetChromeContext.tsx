import { createContext, useContext, type DragEvent } from 'react';

/**
 * Provides placement-level action handlers (Configure, Delete) and drag
 * affordances to the widget chrome (`ComponentWrapper`) without threading
 * them through every widget's props. `ComponentCell` — which owns the
 * placement id — provides this context; `ComponentWrapper` consumes it
 * to render its kebab menu and (when drag is enabled) attach HTML5 drag
 * handlers to the widget root.
 *
 * When a widget is rendered outside a ComponentCell (e.g. in Storybook or
 * a standalone preview), all handlers default to undefined and the
 * affected chrome (kebab, drag grip) does not render.
 */
export interface WidgetChromeHandlers {
  onConfigure?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;

  /** When true, the widget root becomes an HTML5 drag source. */
  draggable?: boolean;
  /** Marks the widget as the currently-dragged source (dimmed styling). */
  isDragging?: boolean;
  /** Marks the widget as the current drop target (insertion-edge bar styling). */
  isDropTarget?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
}

export const WidgetChromeContext = createContext<WidgetChromeHandlers>({});

export function useWidgetChrome(): WidgetChromeHandlers {
  return useContext(WidgetChromeContext);
}

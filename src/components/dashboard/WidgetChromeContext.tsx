import { createContext, useContext } from 'react';

/**
 * Provides placement-level action handlers (Configure, Delete) to the widget
 * chrome (`ComponentWrapper`) without threading them through every widget's
 * props. `ComponentCell` — which owns the placement id — provides this
 * context; `ComponentWrapper` consumes it to render its kebab menu.
 *
 * When a widget is rendered outside a ComponentCell (e.g. in Storybook or
 * a standalone preview), both handlers default to undefined and the kebab
 * menu does not render.
 */
export interface WidgetChromeHandlers {
  onConfigure?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export const WidgetChromeContext = createContext<WidgetChromeHandlers>({});

export function useWidgetChrome(): WidgetChromeHandlers {
  return useContext(WidgetChromeContext);
}

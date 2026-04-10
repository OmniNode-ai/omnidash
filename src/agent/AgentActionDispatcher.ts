import { validateAgentAction } from './actions';
import { nanoid } from 'nanoid';

export interface DispatchResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

// Minimal shape required by dispatcher — duck-typed to accept both full DashboardDefinition and test stubs
export interface DashboardDefinition {
  name: string;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  componentName: string;
  componentVersion: string;
  config: Record<string, unknown>;
}

// Handlers are injected so the dispatcher stays testable without live stores
export interface ActionHandlers {
  addComponentToLayout?: (item: unknown) => Promise<void> | void;
  removeComponentFromLayout?: (id: string) => Promise<void> | void;
  updateLayout?: (layout: unknown[]) => Promise<void> | void;
  updateComponentConfig?: (id: string, config: Record<string, unknown>) => Promise<void> | void;
  setTheme?: (name: string) => void;
  setTimeRange?: (range: string, from?: string, to?: string) => void;
  setFilter?: (key: string, value: string) => void;
  setActiveDashboard?: (def: unknown) => void;
  saveDashboard?: (name?: string) => Promise<string | undefined>;
  getRegistry?: () => {
    getAvailableComponents: () => unknown[];
    getComponentsByCategory: (cat: string) => unknown[];
    getComponent: (name: string) => unknown;
  };
  getThemes?: () => string[];
  getTemplates?: () => DashboardDefinition[];
  getCurrentLayout?: () => DashboardLayoutItem[];
}

export class AgentActionDispatcher {
  private handlers: ActionHandlers = {};

  setHandlers(handlers: ActionHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  async dispatch(actionName: string, args: Record<string, unknown>): Promise<DispatchResult> {
    const validation = validateAgentAction(actionName, args);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    try {
      return await this.execute(actionName, args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private async execute(actionName: string, args: Record<string, unknown>): Promise<DispatchResult> {
    switch (actionName) {
      case 'add_component': {
        const manifest = this.handlers.getRegistry?.().getComponent(args.componentName as string);
        if (!manifest) {
          return { success: false, error: `Component "${args.componentName}" not found in registry` };
        }
        const position = (args.position as { x: number; y: number; w: number; h: number }) ?? { x: 0, y: 0, w: 6, h: 4 };
        await this.handlers.addComponentToLayout?.({
          i: nanoid(8),
          componentName: args.componentName,
          componentVersion: '1.0.0',
          config: args.config ?? {},
          ...position,
        });
        return { success: true, message: `Added ${args.componentName} to dashboard` };
      }

      case 'remove_component': {
        await this.handlers.removeComponentFromLayout?.(args.componentId as string);
        return { success: true, message: `Removed component ${args.componentId}` };
      }

      case 'resize_component': {
        const layout = this.handlers.getCurrentLayout?.() ?? [];
        const pos = args.position as { x: number; y: number; w: number; h: number };
        const updated = layout.map((item) =>
          item.i === args.componentId ? { ...item, ...pos } : item
        );
        await this.handlers.updateLayout?.(updated);
        return { success: true, message: `Resized component ${args.componentId}` };
      }

      case 'update_component_config': {
        await this.handlers.updateComponentConfig?.(
          args.componentId as string,
          args.config as Record<string, unknown>
        );
        return { success: true, message: `Updated config for ${args.componentId}` };
      }

      case 'set_theme': {
        this.handlers.setTheme?.(args.themeName as string);
        return { success: true, message: `Theme set to "${args.themeName}"` };
      }

      case 'set_time_range': {
        this.handlers.setTimeRange?.(args.range as string, args.from as string, args.to as string);
        return { success: true, message: `Time range set to ${args.range}` };
      }

      case 'set_filter': {
        this.handlers.setFilter?.(args.key as string, args.value as string);
        return { success: true, message: `Filter ${args.key}=${args.value} applied` };
      }

      case 'load_template': {
        const templates = this.handlers.getTemplates?.() ?? [];
        const tpl = templates.find((t) => t.name === args.templateName);
        if (!tpl) {
          return {
            success: false,
            error: `Template "${args.templateName}" not found. Available: ${templates.map((t) => t.name).join(', ')}`,
          };
        }
        this.handlers.setActiveDashboard?.(tpl);
        return { success: true, message: `Loaded template "${args.templateName}"` };
      }

      case 'save_dashboard': {
        const id = await this.handlers.saveDashboard?.(args.name as string | undefined);
        return { success: true, message: `Dashboard saved${args.name ? ` as "${args.name}"` : ''}`, data: { id } };
      }

      case 'list_components': {
        const components = args.category
          ? this.handlers.getRegistry?.().getComponentsByCategory(args.category as string) ?? []
          : this.handlers.getRegistry?.().getAvailableComponents() ?? [];
        return { success: true, data: components };
      }

      case 'list_themes': {
        return { success: true, data: this.handlers.getThemes?.() ?? [] };
      }

      case 'list_templates': {
        return { success: true, data: (this.handlers.getTemplates?.() ?? []).map((t) => t.name) };
      }

      default:
        return { success: false, error: `Unknown action: "${actionName}"` };
    }
  }
}

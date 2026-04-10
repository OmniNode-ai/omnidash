export interface AgentActionDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required?: boolean; description: string; enum?: string[] }>;
}

export interface ActionValidationResult {
  valid: boolean;
  errors: string[];
}

export const AGENT_ACTIONS: AgentActionDef[] = [
  {
    name: 'add_component',
    description: 'Add a dashboard component to the current layout at the specified grid position.',
    parameters: {
      componentName: { type: 'string', required: true, description: 'Registry name of the component (e.g. cost-trend-panel)' },
      position: { type: 'object', required: false, description: 'Grid position {x: number, y: number, w: number (1-12), h: number (1-∞)}. Omit to auto-place.' },
      config: { type: 'object', required: false, description: 'Component-specific configuration overrides.' },
    },
  },
  {
    name: 'remove_component',
    description: 'Remove a component from the current layout by its grid item id.',
    parameters: {
      componentId: { type: 'string', required: true, description: 'The grid item id (i) of the component to remove.' },
    },
  },
  {
    name: 'resize_component',
    description: 'Resize or reposition a component on the grid.',
    parameters: {
      componentId: { type: 'string', required: true, description: 'The grid item id to resize.' },
      position: { type: 'object', required: true, description: 'New grid position {x, y, w, h}.' },
    },
  },
  {
    name: 'update_component_config',
    description: 'Update the configuration of an existing component on the dashboard.',
    parameters: {
      componentId: { type: 'string', required: true, description: 'The grid item id of the component.' },
      config: { type: 'object', required: true, description: "Partial config to merge into the component's current config." },
    },
  },
  {
    name: 'set_theme',
    description: 'Switch the dashboard theme.',
    parameters: {
      themeName: { type: 'string', required: true, description: 'Name of the theme to apply (e.g. "dark", "light", "ocean").' },
    },
  },
  {
    name: 'set_time_range',
    description: 'Set the global time range filter applied to all components.',
    parameters: {
      range: {
        type: 'string',
        required: true,
        description: 'Time range preset.',
        enum: ['1h', '6h', '24h', '7d', '30d', '90d', 'custom'],
      },
      from: { type: 'string', required: false, description: 'ISO8601 start (required when range=custom).' },
      to: { type: 'string', required: false, description: 'ISO8601 end (required when range=custom).' },
    },
  },
  {
    name: 'set_filter',
    description: 'Apply a key/value global filter to the dashboard.',
    parameters: {
      key: { type: 'string', required: true, description: 'Filter key (e.g. "agent", "taskType").' },
      value: { type: 'string', required: true, description: 'Filter value.' },
    },
  },
  {
    name: 'load_template',
    description: 'Replace the current dashboard layout with a pre-composed template.',
    parameters: {
      templateName: { type: 'string', required: true, description: 'Template name (e.g. "Cost & Delegation", "Platform Health").' },
    },
  },
  {
    name: 'save_dashboard',
    description: 'Save the current dashboard definition with an optional new name.',
    parameters: {
      name: { type: 'string', required: false, description: 'New dashboard name. Omit to save under existing name.' },
    },
  },
  {
    name: 'list_components',
    description: 'List all available components in the registry, optionally filtered by category.',
    parameters: {
      category: {
        type: 'string',
        required: false,
        description: 'Filter by category.',
        enum: ['visualization', 'metrics', 'table', 'status', 'stream'],
      },
    },
  },
  {
    name: 'list_themes',
    description: 'List all available themes.',
    parameters: {},
  },
  {
    name: 'list_templates',
    description: 'List all available dashboard templates.',
    parameters: {},
  },
];

export function validateAgentAction(
  actionName: string,
  args: Record<string, unknown>
): ActionValidationResult {
  const action = AGENT_ACTIONS.find((a) => a.name === actionName);
  if (!action) {
    return { valid: false, errors: [`Unknown action: "${actionName}"`] };
  }

  const errors: string[] = [];
  for (const [param, def] of Object.entries(action.parameters)) {
    if (def.required && !(param in args)) {
      errors.push(`${param} is required`);
    }
    if (def.enum && param in args && !def.enum.includes(args[param] as string)) {
      errors.push(`${param} must be one of: ${def.enum.join(', ')}`);
    }
  }

  // Conditional: when range=custom, from and to are required
  if (actionName === 'set_time_range' && args.range === 'custom') {
    if (!args.from) errors.push('from is required when range=custom');
    if (!args.to) errors.push('to is required when range=custom');
  }

  return { valid: errors.length === 0, errors };
}

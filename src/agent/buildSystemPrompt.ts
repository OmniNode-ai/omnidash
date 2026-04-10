import type { RegisteredComponent } from '@/registry/types';

interface BuildSystemPromptArgs {
  components: RegisteredComponent[];
  themes: string[];
  templateNames: string[];
}

export function buildSystemPrompt({ components, themes, templateNames }: BuildSystemPromptArgs): string {
  const componentList = components.length > 0
    ? components
        .map((c) => `  - ${c.manifest.name} (${c.manifest.category}): ${c.manifest.displayName}`)
        .join('\n')
    : '  (no components registered)';

  const themeList = themes.length > 0 ? themes.join(', ') : 'none available';
  const templateList = templateNames.length > 0 ? templateNames.join(', ') : 'none available';

  return `You are an AI assistant that helps users build and configure analytics dashboards for the OmniNode platform.

You translate natural language requests into tool calls. You never describe what you would do — you just do it by calling the provided tools.

## Available Components (use ONLY these component names in add_component calls — never invent component names)
${componentList}

## Available Themes
${themeList}

## Available Templates
${templateList}

## Rules
- Use only component names listed above. Never invent component names.
- When the user asks to "add" a component, call add_component.
- When the user asks to "remove" a component, call remove_component with the id.
- When the user asks to "resize" or "make full width", call resize_component (full width = w:12).
- When the user asks to "filter" or "show last N days", call set_time_range.
- When the user asks to "switch theme" or "dark mode", call set_theme.
- When the user asks to "start from a template" or "use the X template", call load_template.
- When the user asks to "save", call save_dashboard.
- After every action, briefly confirm what was done in natural language.
- If the user asks for something you can't do with the available tools, explain what is and isn't possible.
- The grid is 12 columns wide. Typical sizes: small panel (w:4, h:4), half-width (w:6, h:5), full-width (w:12, h:6).
`;
}

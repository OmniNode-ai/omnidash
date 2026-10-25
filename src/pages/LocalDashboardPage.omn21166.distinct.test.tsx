// OMN-21166 (Lakshman, 2026-10-18: "every differet things should have differet icons and colors"): every panel on
// the local pages has its own Lucide icon and its own accent colour, in both themes.
//
// Failure modes, each with a test below:
//   D1  two panels share an icon (seen: Actual spend / Baseline spend, the two Usage charts, Tier mix / Tokens per run)
//   D2  a panel shares an icon with a sidebar destination it is not (seen: Quality / Delegation Evidence)
//   D3  a panel has no accent of its own and falls back to the shared default blue
//   D4  two panels share an accent colour in a theme
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PANEL_ICONS } from './LocalDashboardPage';

const CSS = readFileSync('src/styles/local-dashboard.css', 'utf8');
const PAGES = ['overview', 'runs', 'workflow', 'usage', 'credentials', 'api-keys'];
const components = PAGES.flatMap(page =>
  (JSON.parse(readFileSync(`src/pages/local/${page}.contracts.yaml`, 'utf8')) as { components: Array<{ component_id: string }> })
    .components.map(component => component.component_id));

/** The last --panel-accent the stylesheet gives a component in a theme (later rules win at equal specificity). */
function accent(componentId: string, dark: boolean): string | undefined {
  const selector = `${dark ? '[data-theme="dark"] ' : ''}.local-dashboard-panel[data-component="${componentId}"]`;
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, sel]) => sel!.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(part => part.trim()).includes(selector))
    .map(([, , body]) => /--panel-accent:\s*([^;]+);/.exec(body!)?.[1]?.trim())
    .filter(Boolean);
  return rules[rules.length - 1];
}

// Owner2026-10-19T11:15Z: different things differ, and vice versa.
// The same recent-run/routing/activity component reused across pages remains one concept.
// Environment moved from Overview to API Keys (live review 2026-10-25): one concept.
const concept = (id: string) => ({ 'overview-environment': 'api-keys-environment', 'overview-recent-runs': 'recent-runs', 'runs-tier-mix': 'overview-tier-mix', 'runs-insights': 'overview-insights' } as Record<string, string>)[id] ?? id;

describe('OMN-21166: each different concept has its own icon and colour', () => {
  it('D1: no two panels share an icon', () => {
    const icons = components.map(id => [id, PANEL_ICONS[id]?.displayName ?? (PANEL_ICONS[id] as { name?: string } | undefined)?.name] as const);
    expect(icons.filter(([, icon]) => icon === undefined)).toEqual([]);
    const seen = new Map<string, string>();
    const clashes = icons.flatMap(([id, icon]) => {
      const other = seen.get(icon!);
      seen.set(icon!, id);
      return other && concept(other) !== concept(id) ? [`${other} and ${id} share ${icon}`] : [];
    });
    expect(clashes).toEqual([]);
  });

  it('D2: no panel borrows the icon of a sidebar destination it is not', () => {
    const SIDEBAR = { BadgeCheck: 'Delegation Evidence', Activity: 'Runs', ChartColumn: 'Usage', LockKeyhole: 'API Keys', LayoutDashboard: 'Overview', Workflow: 'Workflow' } as Record<string, string>;
    const borrowed = components.flatMap(id => {
      const icon = PANEL_ICONS[id]?.displayName ?? '';
      return SIDEBAR[icon] ? [`${id} uses ${icon} (${SIDEBAR[icon]})`] : [];
    });
    expect(borrowed).toEqual([]);
  });

  it.each([false, true])('D3, D4: every panel has its own accent (dark theme: %s)', (dark) => {
    const accents = components.map(id => [id, accent(id, dark)] as const);
    expect(accents.filter(([, colour]) => colour === undefined).map(([id]) => id)).toEqual([]);
    const counts = new Map<string, string[]>();
    for (const [id, colour] of accents) counts.set(colour!.toLowerCase(), [...(counts.get(colour!.toLowerCase()) ?? []), id]);
    expect([...counts.values()].filter(ids => new Set(ids.map(concept)).size > 1)).toEqual([]);
  });
});

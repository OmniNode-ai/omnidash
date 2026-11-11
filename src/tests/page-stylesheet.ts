import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The page stylesheets whose kit rules moved under src/theme/design-system/kit (OMN-23330 AC29). */
export type PageStylesheet = 'local-dashboard' | 'seven-page-design' | 'editorial' | 'dashboard-cards' | 'event-dash' | 'field-identity';

/**
 * A page stylesheet's whole source as the app loads it: its kit part (src/theme/design-system/kit/<name>.css) first, then
 * the page's own rules (src/styles/<name>.css). OMN-23330 AC29 moved every rule that styles a kit component into the kit
 * part, so a test about one of those rules reads both.
 */
export function pageStylesheet(name: PageStylesheet, root = process.cwd()): string {
  const kit = path.join(root, 'src/theme/design-system/kit', `${name}.css`);
  return `${existsSync(kit) ? readFileSync(kit, 'utf8') : ''}\n${readFileSync(path.join(root, 'src/styles', `${name}.css`), 'utf8')}`;
}

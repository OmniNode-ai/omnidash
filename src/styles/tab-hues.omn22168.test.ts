// OMN-22168 (Lakshman 2026-11-05, "why color same?"): the tabs of one row are told apart by colour, so no two concepts
// shown side by side may read as one colour. Overview's Runs per day, Model usage and Tier mix were 331, 358 and 351
// degrees at one lightness and chroma: three pinks. Failure modes, each caught below:
//   H1  two tabs of one row (or two task types, or two run steps) are the same colour to the eye in either theme;
//   H2  a concept a row needs has no colour token in a theme (it would fall back to a borrowed colour).
// The distance is measured in OKLab, so two concepts may share a hue when their lightness tells them apart (Run charts'
// duration and cost, card colours fixed by OMN-21970 AC8). 0.07 is about 37 degrees of hue at oklch chroma 0.11; the
// three pinks were 0.013 to 0.06 apart.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../theme/design-system/tokens.css'), 'utf8');
const declared = (selectorTest: (selector: string) => boolean) => {
  const tokens = new Map<string, string>();
  for (const block of css.matchAll(/^([^\n{]+)\{([\s\S]*?)^\}/gm)) {
    if (!selectorTest(block[1]!.trim())) continue;
    for (const entry of block[2]!.matchAll(/(--ds-[a-z0-9-]+):\s*([^;]+);/g)) tokens.set(entry[1]!, entry[2]!.trim());
  }
  return tokens;
};
const LIGHT = declared(selector => selector.startsWith(':root'));
const DARK = new Map([...LIGHT, ...declared(selector => selector === '[data-theme="dark"]')]);

type Lab = [number, number, number];
function fromHex(hex: string): Lab {
  const linear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16))) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function lab(tokens: Map<string, string>, concept: string): Lab | null {
  let value = tokens.get(`--ds-field-${concept}`);
  for (let depth = 0; value?.startsWith('var(') && depth < 5; depth += 1) value = tokens.get(/var\((--ds-[a-z0-9-]+)/.exec(value)![1]!);
  if (!value) return null;
  const oklch = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(value);
  if (oklch) {
    const [L, C, H] = [Number(oklch[1]) / 100, Number(oklch[2]), (Number(oklch[3]) * Math.PI) / 180];
    return [L, C * Math.cos(H), C * Math.sin(H)];
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? fromHex(value) : null;
}
const distance = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** What one row of tabs (or one chart's series) shows side by side, by concept token (the tone each tab passes). */
const ROWS: Record<string, readonly string[]> = {
  'Overview charts': ['runs-daily', 'tokens-daily', 'runs-model', 'tier-mix'],
  'Run charts': ['duration', 'tokens', 'cost', 'score', 'runs-daily'],
  'Run analysis': ['task', 'pass-rate-daily', 'failures', 'duration', 'quality-model', 'activity-hourly'],
  'Routing views': ['tier-mix', 'run-routes'],
  'Savings and spend charts': ['savings-daily', 'savings', 'spend-model', 'cost-per-run', 'cost-route'],
  'Token charts': ['tokens-daily', 'tokens-model'],
  'Usage analysis views': ['usage-analysis', 'routing-model', 'pass-rate-daily', 'quality-comparison'],
  'Failure triage': ['failures', 'model', 'task'],
  'Task types': ['task-document', 'task-summarization', 'task-code-generation', 'task-test', 'task-other', 'task-research', 'task-code-review'],
  'Run steps': ['step-request', 'step-routing', 'step-provider-call', 'step-quality', 'step-terminal', 'step-other'],
};
const APART = 0.07;

describe('OMN-22168: concepts shown side by side are different colours', () => {
  for (const [theme, tokens] of [['light', LIGHT], ['dark', DARK]] as const) {
    for (const [row, concepts] of Object.entries(ROWS)) {
      it(`H1, H2: ${theme} ${row}: every pair is at least ${APART} apart`, () => {
        const colours = concepts.map(concept => [concept, lab(tokens, concept)] as const);
        for (const [concept, colour] of colours) expect(colour, `${theme} --ds-field-${concept} is declared`).not.toBeNull();
        for (let i = 0; i < colours.length; i += 1) {
          for (let j = i + 1; j < colours.length; j += 1) {
            const gap = distance(colours[i]![1]!, colours[j]![1]!);
            expect(gap, `${theme} ${row}: ${colours[i]![0]} and ${colours[j]![0]}`).toBeGreaterThanOrEqual(APART);
          }
        }
      });
    }
  }
});

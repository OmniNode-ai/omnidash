import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fields from '@/components/dashboard/FieldIcon';
import { fieldTone } from '@/components/dashboard/field-identity';
import { WorkflowRoutingFlow } from '@/pages/local/workflow-analysis';
import * as Destinations from '@/navigation/destination-icons';
import type { AppPage } from '@/store/types';

// Failure modes: a label alias loses its identity; a page substitutes an unrelated
// icon; unknown outcome disappears or inherits success; two canonical facts collide.
function svgOf(markup: string, selector = 'svg') {
  const element = document.createElement('div');
  element.innerHTML = markup;
  const svg = element.querySelector(selector);
  expect(svg, `expected a rendered icon for ${selector}`).not.toBeNull();
  return svg!;
}
const field = (label: string, value?: unknown) => renderToStaticMarkup(<Fields.FieldIcon label={label} value={value} />);
const shape = (svg: Element) => svg.innerHTML;

// This is a declared-CSS inventory, not a claim about computed browser colour.
// The browser census separately catches specificity, inherited ink and inline overrides.
const fieldCss = readFileSync('src/styles/field-identity.css', 'utf8');
const destinationCss = readFileSync('src/styles/destination-identity.css', 'utf8');

// The historical base has private ICONS maps. Discover only their literal keys;
// never evaluate source or substitute a head registry into the base product.
function sourceRegistryKeys(file: string, exportedName: string): string[] {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const declaration = new RegExp(`\\b(?:export\\s+)?const\\s+(?:${exportedName}|ICONS)\\s*:[^=]+?=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(source);
  if (!declaration) throw new Error(`No literal identity registry in ${file}`);
  const entries = declaration[1]!.split(',').map(entry => entry.trim()).filter(Boolean);
  if (entries.length === 0) throw new Error(`Empty source identity registry in ${file}`);
  return entries.map(entry => {
    const literal = /^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:\s*[A-Za-z_$][\w$]*$/.exec(entry);
    if (!literal) throw new Error(`Unsupported identity entry in ${file}: ${entry}`);
    return literal[1] ?? literal[2] ?? literal[3]!;
  });
}
const parsedFieldKeys = sourceRegistryKeys('src/components/dashboard/FieldIcon.tsx', 'FIELD_ICONS');
const parsedDestinationKeys = sourceRegistryKeys('src/navigation/destination-icons.tsx', 'DESTINATION_ICONS');
const fieldKeys = Fields.FIELD_ICONS ? Object.keys(Fields.FIELD_ICONS) : parsedFieldKeys;
const destinationKeys = Destinations.DESTINATION_ICONS ? Object.keys(Destinations.DESTINATION_ICONS) : parsedDestinationKeys;
const cssRules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap(([, selectors, body]) => selectors!.split(',').map(selector => ({
    selector: selector.trim(),
    declarations: [...body!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [key!, value!.trim()] as const),
  })));

function resolveVariable(value: string, variables: Map<string, string>, seen: string[] = []): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/g, (_, key: string, fallback?: string) => {
    if (seen.includes(key)) throw new Error(`CSS variable cycle: ${[...seen, key].join(' -> ')}`);
    const declaration = variables.get(key) ?? fallback;
    if (declaration === undefined) throw new Error(`Missing CSS variable ${key}`);
    return resolveVariable(declaration, variables, [...seen, key]);
  });
}

function normaliseColour(value: string): string {
  const normal = value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1');
  if (/^#[\da-f]{3}$/.test(normal)) return '#' + [...normal.slice(1)].map(c => c + c).join('');
  if (!normal || normal.includes('var(')) throw new Error(`Unresolved declared colour: ${normal}`);
  return normal;
}

type IdentityPair = { id: string; shape: string; colour: string };
function assertUniquePairs(pairs: readonly IdentityPair[]) {
  if (pairs.length === 0) throw new Error('Identity inventory is empty');
  const seen = new Map<string, string>();
  for (const pair of pairs) {
    const key = JSON.stringify([pair.shape, pair.colour]);
    const other = seen.get(key);
    if (other !== undefined && other !== pair.id) throw new Error(`Duplicate icon/colour pair: ${other} and ${pair.id}`);
    seen.set(key, pair.id);
  }
}

function declaredPairs(dark: boolean): IdentityPair[] {
  const fields = cssRules(fieldCss);
  const variables = new Map<string, string>();
  for (const rule of fields) {
    if (rule.selector === ':root' || (dark && rule.selector === '[data-theme="dark"]')) {
      for (const [key, value] of rule.declarations) variables.set(key, value);
    }
  }
  const fieldPairs = fieldKeys.map(id => {
    const selector = `[data-field-tone="${id}"]`;
    const applicable = fields.filter(rule => rule.selector === selector
      || (dark && rule.selector === `[data-theme="dark"] ${selector}`));
    const ink = applicable.flatMap(rule => rule.declarations).filter(([key]) => key === '--field-ink').at(-1)?.[1];
    if (!ink) throw new Error(`Missing canonical colour selector ${selector}`);
    if (!variables.has(`--field-${id}`)) throw new Error(`Missing canonical colour token --field-${id}`);
    return { id: `field:${id}`, shape: shape(svgOf(renderToStaticMarkup(<Fields.FieldIcon tone={id} />))),
      colour: normaliseColour(resolveVariable(ink, variables)) };
  });
  const destinations = cssRules(destinationCss);
  const destinationPairs = (destinationKeys as AppPage[]).map(page => {
    const selector = `[data-destination="${page}"]`;
    const matching = destinations.filter(rule => rule.selector === '[data-destination]' || rule.selector === selector
      || (dark && (rule.selector === '[data-theme="dark"] [data-destination]' || rule.selector === `[data-theme="dark"] ${selector}`)));
    const ink = matching.flatMap(rule => rule.declarations).filter(([key]) => key === '--nav-accent').at(-1)?.[1];
    if (!ink) throw new Error(`Missing destination colour ${page}`);
    return { id: `destination:${page}`, shape: shape(svgOf(renderToStaticMarkup(<Destinations.DestinationIcon page={page} />))),
      colour: normaliseColour(resolveVariable(ink, variables)) };
  });
  return [...fieldPairs, ...destinationPairs];
}

describe('OMN-21308 AC1 canonical field identities', () => {
  it('source discovery is nonempty and agrees exactly with each available public registry', () => {
    expect(parsedFieldKeys.length).toBeGreaterThan(0);
    expect(parsedDestinationKeys.length).toBeGreaterThan(0);
    expect(new Set(parsedFieldKeys).size).toBe(parsedFieldKeys.length);
    expect(new Set(parsedDestinationKeys).size).toBe(parsedDestinationKeys.length);
    if (Fields.FIELD_ICONS) expect([...fieldKeys].sort()).toEqual([...parsedFieldKeys].sort());
    if (Destinations.DESTINATION_ICONS) expect([...destinationKeys].sort()).toEqual([...parsedDestinationKeys].sort());
    // The fallback population must actually render through the public components.
    for (const id of parsedFieldKeys) svgOf(renderToStaticMarkup(<Fields.FieldIcon tone={id} />));
    for (const page of parsedDestinationKeys) svgOf(renderToStaticMarkup(<Destinations.DestinationIcon page={page as AppPage} />));
  });

  it.each([
    ['Model', 'Routed model'], ['Run', 'Correlation'], ['Run', 'Receipt id'],
    ['Not tier-routed', 'Without a tier'], ['Tokens in', 'Input tokens'],
    ['Tokens out', 'Output tokens'], ['Actual spend', 'Cost'],
  ])('%s and its %s alias use the same actual icon and colour identity', (canonical, alias) => {
    expect(fieldTone(canonical)).toBeTruthy();
    expect(fieldTone(alias)).toBe(fieldTone(canonical));
    expect(shape(svgOf(field(alias)))).toBe(shape(svgOf(field(canonical))));
  });

  it.each([false, true])('all exported identities have distinct actual SVG/declared colour pairs (dark=%s)', dark => {
    const pairs = declaredPairs(dark);
    expect(pairs.filter(pair => pair.id.startsWith('field:'))).toHaveLength(fieldKeys.length);
    expect(pairs.filter(pair => pair.id.startsWith('destination:'))).toHaveLength(destinationKeys.length);
    expect(pairs.length).toBeGreaterThan(11);
    expect(() => assertUniquePairs(pairs)).not.toThrow();
  });

  it('the pair detector rejects a planted duplicate despite its different concept id', () => {
    const original = declaredPairs(false)[0]!;
    expect(() => assertUniquePairs([original, { ...original, id: 'planted-different-concept' }]))
      .toThrow('Duplicate icon/colour pair');
    expect(() => assertUniquePairs([original, { ...original, id: 'different-colour-control', colour: '#010203' }]))
      .not.toThrow();
  });

  it('declared-colour resolution follows aliases and rejects missing or cyclic variables', () => {
    const variables = new Map([['--a', 'var(--b)'], ['--b', ' #AbC ']]);
    expect(normaliseColour(resolveVariable('var(--a)', variables))).toBe('#aabbcc');
    expect(() => resolveVariable('var(--missing)', variables)).toThrow('Missing CSS variable');
    expect(() => resolveVariable('var(--a)', new Map([['--a', 'var(--b)'], ['--b', 'var(--a)']])))
      .toThrow('CSS variable cycle');
  });

  it.each(['Status', 'Outcome'])('unrecorded %s has a neutral icon distinct from pass and fail', label => {
    const unknown = svgOf(field(label, 'Not recorded'));
    expect(unknown.classList.contains('lucide-circle-dot')).toBe(true);
    expect(shape(unknown)).not.toBe(shape(svgOf(field(label, 'passed'))));
    expect(shape(unknown)).not.toBe(shape(svgOf(field(label, 'failed'))));
  });
});

describe('OMN-21308 AC2 actual Workflow icon consumers', () => {
  const flow = (outcome: string) => renderToStaticMarkup(<WorkflowRoutingFlow
    decision={{ task_type: 'summarization', backend_id: 'local', model_name: 'fixture-model' }} outcome={outcome} />);

  it('the Workflow model node draws the shared Model icon rather than Bot', () => {
    const actual = svgOf(flow('passed'), '[data-flow-kind="model"] > svg');
    expect(shape(actual)).toBe(shape(svgOf(field('Model'))));
    expect(actual.classList.contains('lucide-brain-circuit')).toBe(true);
  });

  it.each(['passed', 'failed', 'Not recorded'])('Workflow %s outcome uses its actual state icon, not a score award', outcome => {
    const actual = svgOf(flow(outcome), '[data-flow-kind="outcome"] > svg');
    expect(shape(actual)).toBe(shape(svgOf(field('Outcome', outcome))));
    expect(actual.classList.contains('lucide-award')).toBe(false);
  });
});

import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { icons } from 'lucide-react';
import { expect, test, type Page } from 'playwright/test';
import { PAGE_LABELS, PAGE_PATHS } from '../../src/navigation/page-routes';
import type { AppPage } from '../../src/store/types';
import { chartRows, prefix, revealRunFields, serveCharts } from './omn21166-chart-fixtures';
import { resolveCensusSourceSha } from './census-source.mjs';

const sourceSha = resolveCensusSourceSha();

// AC4 failure modes declared before implementation: an omitted destination or
// disclosure, an empty census, an unmapped semantic icon, forged Lucide metadata,
// one concept changing its actual icon/colour, and two concepts sharing a pair.
// Actions and decoration are recorded explicitly, never dropped via aria-hidden.
// Fixture rendering evidence is distinct from the main-Chrome shared-data walk.
// OMN-21166 part 26: one Settings page holds API Keys and Credentials, so ten destinations.
const destinations: AppPage[] = ['local-overview', 'local-runs', 'local-workflow',
  'local-usage', 'local-settings', 'delegation-evidence',
  'experiments', 'sea-control', 'event-bus', 'lab'];
const routing = chartRows[prefix + 'delegation.model-routing.v1'][0] as Record<string, unknown>;
const rows = { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-17T10:00:00Z',
  total_baseline_cost_usd: '10.0000', total_cost_usd: '2.0000', total_savings_usd: '8.0000',
  run_count: 10, measured_run_count: 10, tokens_total: 1000,
}], [prefix + 'delegation.model-routing.v1']: [{ ...routing,
  by_tier: { ...routing.by_tier as object, local_call_share: .6, local_call_count: 6, total_call_count: 10 },
}], [prefix + 'topic-activity.v1']: [{
  topic: 'onex.evt.identity.sample.v1', sampled_at: '2026-10-17T10:00:00Z',
  retained_messages: 12, messages_last_hour: 2, messages_last_24h: 12,
  rate_per_second: 0, activity_state: 'UNKNOWN', projection_cursor: 'identity',
}], [prefix + 'run-trace.v1']: ['request', 'routing_decision', 'provider_call', 'provider_call', 'quality_gate', 'terminal'].map((step_kind, index) => ({
  correlation_id: 'chart-run-a', step_sequence: index + 1, step_kind,
  outcome: 'succeeded', duration_ms: index + 1,
  ...(step_kind === 'provider_call' ? { attempt_number: index - 1 } : {}),
})) };

type Reading = {
  medium: 'icon' | 'graphic' | 'text';
  kind: 'semantic' | 'action' | 'decoration' | 'unmapped';
  concept: string; label: string; icon: string; signature: string;
  color: string; background: string; selector: string; unavailable: boolean;
  shapeMatches: boolean; declaredIconMatches: boolean;
  paintMatches?: boolean; labelCorroborated?: boolean;
  contrast?: number; contrastThreshold?: number; renderedForeground?: string; contrastUnmeasured?: string;
  canonicalFieldColor?: string; canonicalFieldColorMatches?: boolean;
  geometryPaint?: Array<{ tag: string; stroke: string; fill: string; opacity: string; strokeOpacity: string; fillOpacity: string; strokeWidth: string; visible: boolean }>;
};
type State = { destination: AppPage; theme: string; developer: boolean;
  capturedAt: string; source: string; readings: Reading[] };

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const iconByClass = new Map(Object.entries(icons).map(([name, icon]) => [kebab(name), icon]));

async function settleStyles(page: Page) {
  await page.evaluate(async () => {
    // A global transition.finished can remain pending on an unrelated paused
    // animation. Observe the actual visible paint instead, with a bounded,
    // diagnostic failure if a measured transition is paused or never settles.
    const visible = (el: Element) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && [...el.getClientRects()].some(rect => rect.width > 0 || rect.height > 0);
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const paints = () => [...document.body.querySelectorAll('*')].filter(visible).map(el => {
      const css = getComputedStyle(el);
      return `${el.tagName}.${[...el.classList].join('.')}:${[css.color, css.backgroundColor,
        css.backgroundImage, css.stroke, css.fill, css.opacity, css.borderColor, css.boxShadow].join('|')}`;
    });
    const activeTransitions = () => document.getAnimations().flatMap(animation => {
      if (!(animation instanceof CSSTransition) || !(animation.effect instanceof KeyframeEffect)) return [];
      const target = animation.effect.target, timing = animation.effect.getComputedTiming();
      if (!(target instanceof Element) || !visible(target) || !Number.isFinite(Number(timing.endTime))) return [];
      if (animation.playState !== 'running' && !(animation.playState === 'paused' && timing.progress !== null && timing.progress < 1)) return [];
      return [{ target: `${target.tagName}.${[...target.classList].join('.')}`, property: animation.transitionProperty,
        playState: animation.playState, currentTime: String(animation.currentTime), endTime: String(timing.endTime), progress: timing.progress }];
    });
    let previous = paints(), stable = 0, changed: string[] = [], transitions = activeTransitions(), stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const bounded = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Visible paints did not settle within 2000ms: ${JSON.stringify({ transitions, changed })}`)), 2000);
    });
    try {
      await Promise.race([bounded, (async () => {
        while (!stopped && stable < 3) {
          await frame();
          const current = paints();
          changed = current.filter((paint, index) => paint !== previous[index]).slice(0, 8);
          transitions = activeTransitions();
          stable = current.length === previous.length && changed.length === 0 && transitions.length === 0 ? stable + 1 : 0;
          previous = current;
        }
      })()]);
    } finally { stopped = true; clearTimeout(timer!); }
  });
}

async function collect(page: Page): Promise<Reading[]> {
  const names = await page.locator('svg.lucide').evaluateAll(elements => [...new Set(elements.flatMap(el =>
    [...el.classList].filter(name => name.startsWith('lucide-')).map(name => name.slice(7))))]);
  const references = Object.fromEntries(names.flatMap(name => {
    const Icon = iconByClass.get(name);
    return Icon ? [[name, renderToStaticMarkup(createElement(Icon))]] : [];
  }));
  return page.locator('body').evaluate((body, referenceSvgs) => {
    const visible = (el: Element) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && [...el.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const shape = (svg: Element) => JSON.stringify([...svg.children].map(child => ({
      tag: child.tagName.toLowerCase(), attributes: [...child.attributes]
        .filter(attr => !['class', 'style', 'key'].includes(attr.name))
        .map(attr => [attr.name, attr.value]).sort(([a], [b]) => a!.localeCompare(b!)),
    })));
    const labelFor = (el: Element) => {
      const explicit = el.closest('[data-semantic-label]')?.getAttribute('data-semantic-label');
      if (explicit) return clean(explicit);
      const owner = el.closest('dt, h1, h2, h3, h4, summary, button, a, [role="button"], .k-l, .k');
      return clean(owner?.getAttribute('aria-label') || owner?.textContent
        || el.parentElement?.getAttribute('aria-label') || el.parentElement?.textContent
        || (el.closest('.local-dashboard-page-icon') ? body.querySelector('h1')?.textContent : '')
        || el.closest('.local-task-icon, .ins-chip-icon')?.nextElementSibling?.textContent
        || el.closest('.local-chart-heading')?.querySelector('h3')?.textContent).slice(0, 180);
    };
    const visibleLabelFor = (svg: Element) => {
      const context = svg.closest('.local-dashboard-fields > div, .kv > div, .workflow-flow-node, .local-model-identity, .local-chart-heading, h1, h2, h3, h4, .k-l, .k, dt, button, a, summary')
        || (svg.closest('.local-dashboard-page-icon') ? svg.closest('.local-dashboard-page-icon')!.parentElement : null)
        || svg.closest('.local-task-icon, .ins-chip-icon')?.parentElement || svg.parentElement;
      if (!context) return '';
      const text: string[] = [];
      const walker = document.createTreeWalker(context, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement;
        if (!parent || parent.closest('svg, .sr-only') || !node.textContent?.trim() || !visible(parent)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        if ([...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1)) text.push(node.textContent);
      }
      return clean(text.join(' '));
    };
    // Canvas converts every supported computed CSS colour (including oklch)
    // to sRGB. Composite all alpha layers, rather than returning the first
    // translucent ancestor as though it were an opaque backing.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      const pixel = [...context.getImageData(0, 0, 1, 1).data];
      return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]! / 255];
    };
    const over = (front: number[], back: number[]) => {
      const alpha = front[3]! + back[3]! * (1 - front[3]!);
      return [0, 1, 2].map(i => (front[i]! * front[3]! + back[i]! * back[3]! * (1 - front[3]!)) / alpha).concat(alpha);
    };
    const rgbString = (color: number[]) => `rgb(${color.slice(0, 3).map(Math.round).join(', ')})`;
    const backgroundFor = (el: Element | null) => {
      const ancestors: Element[] = [];
      for (let parent = el; parent; parent = parent.parentElement) ancestors.push(parent);
      let composed = [255, 255, 255, 1]; // opaque browser canvas under html
      for (const ancestor of ancestors.reverse()) composed = over(rgba(getComputedStyle(ancestor).backgroundColor), composed);
      return rgbString(composed);
    };
    const contrastFor = (color: string, background: string, threshold: number) => {
      if (!CSS.supports('color', color)) return { contrastThreshold: threshold, contrastUnmeasured: `non-solid CSS paint: ${color}` };
      const back = rgba(background), front = over(rgba(color), back);
      const luminance = (channels: number[]) => channels.slice(0, 3).map(c => c / 255)
        .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
        .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index]!, 0);
      const values = [luminance(front), luminance(back)].sort((a, b) => b - a);
      return { renderedForeground: rgbString(front), contrast: (values[0]! + .05) / (values[1]! + .05), contrastThreshold: threshold };
    };
    const fieldColor = (tone: string) => {
      if (!getComputedStyle(body).getPropertyValue(`--field-${tone}`).trim()) return undefined;
      const probe = document.createElement('span'); probe.style.color = `var(--field-${tone})`;
      body.append(probe); const color = rgbString(rgba(getComputedStyle(probe).color)); probe.remove();
      return color;
    };
    const compareFieldPaint = (concept: string, color: string, unavailable: boolean) => {
      if (!concept.startsWith('field:')) return {};
      const canonicalFieldColor = fieldColor(unavailable ? 'unavailable' : concept.slice('field:'.length));
      return { canonicalFieldColor, canonicalFieldColorMatches: canonicalFieldColor !== undefined
        && CSS.supports('color', color) && rgbString(rgba(color)) === canonicalFieldColor };
    };
    const readings: Reading[] = [];
    for (const svg of body.querySelectorAll('svg.lucide')) {
      const drawnLabel = visibleLabelFor(svg);
      // OMN-21166 Maple grid: inside Usage's savings panel the chart's own symbol and its title are hidden together (the
      // panel carries the title); a symbol hidden with its whole title is not a hidden icon beside a visible label.
      const chartHeading = svg.closest('.local-chart-heading');
      if (chartHeading && !visible(svg) && chartHeading.querySelector('h3') && !visible(chartHeading.querySelector('h3')!)) continue;
      // A hidden semantic SVG beside a visible field label must fail paint
      // verification rather than silently disappear from a nonempty census.
      if (!visible(svg) && !(svg.closest('[data-semantic-concept], [data-field-icon]') && drawnLabel)) continue;
      const icon = [...svg.classList].find(name => name.startsWith('lucide-'))?.slice(7) ?? '';
      const label = labelFor(svg);
      const semantic = svg.closest('[data-semantic-concept]')?.getAttribute('data-semantic-concept');
      const field = svg.getAttribute('data-field-icon')
        ?? svg.closest('[data-field-tone]')?.getAttribute('data-field-tone');
      // A destination ancestor around an entire page cannot classify every
      // child icon as navigation. Restrict the fallback to the actual link or
      // dedicated page-header icon slot.
      const destination = svg.closest('a[data-destination]')?.getAttribute('data-destination')
        ?? (svg.closest('.local-dashboard-page-icon') ? svg.closest('[data-destination]')?.getAttribute('data-destination') : undefined);
      const model = svg.closest('.local-model-identity');
      const modelId = model ? clean(model.getAttribute('data-model') || model.textContent) : '';
      let concept = modelId ? `model:${modelId}` : semantic || (field ? `field:${field}` : destination ? `destination:${destination}` : '');
      let kind: Reading['kind'] = concept ? 'semantic' : 'unmapped';
      // OMN-21166 part 12 AC73: the "About <card>" info button sits inside a field-toned card but is a control, not that
      // field's icon; it is recorded as an action (its Lucide shape and paint are still compared with the canonical icon).
      if (svg.closest('button.local-card-info') && icon === 'info') { kind = 'action'; concept = 'action:info'; }
      // Exact affordance icons plus a control are the action allowlist. A Bot,
      // Award, Model etc. inside a clickable semantic row is NOT an action.
      const control = svg.closest('button,a,summary,[role="button"]');
      const actionIcons = new Set(['copy', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'chevrons-left', 'chevrons-right', 'sliders-horizontal',
        'arrow-up-right', 'external-link', 'rotate-ccw', 'refresh-cw', 'panel-left-close',
        'panel-left-open', 'menu', 'x', 'sun', 'moon', 'search', 'filter', 'settings', 'ellipsis',
        // OMN-21166 live review 2026-10-25: the Overview window control's calendar button (Pick a UTC day).
        'calendar-days',
        // OMN-21166 part 24 AC148: each Overview graph's labelled "Expand" button opens its larger view.
        'maximize2', 'maximize-2']);
      if (!concept && control && label && actionIcons.has(icon)) { kind = 'action'; concept = `action:${icon}`; }
      if (!concept && icon === 'check' && control && /^copy/i.test(label)) { kind = 'action'; concept = 'action:copy-confirmation'; }
      if (!concept && icon === 'scan-line' && svg.classList.contains('local-chart-inspect-icon')) {
        kind = 'decoration'; concept = 'decoration:chart-inspection-hint';
      }
      const reference = referenceSvgs[icon];
      const parsed = reference ? new DOMParser().parseFromString(reference, 'image/svg+xml').documentElement : null;
      const declaredIcon = svg.closest('[data-semantic-icon]')?.getAttribute('data-semantic-icon');
      const css = getComputedStyle(svg);
      const geometrySelector = 'path,line,circle,rect,ellipse,polyline,polygon';
      const actualGeometry = [...svg.querySelectorAll(geometrySelector)];
      const referenceGeometry = parsed ? [...parsed.querySelectorAll(geometrySelector)] : [];
      const geometryPaint = actualGeometry.map(el => {
        const paint = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), stroke: paint.stroke, fill: paint.fill,
          opacity: paint.opacity, strokeOpacity: paint.strokeOpacity, fillOpacity: paint.fillOpacity,
          strokeWidth: paint.strokeWidth, visible: el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            && (rect.width > 0 || rect.height > 0) };
      });
      const paintMatches = visible(svg) && geometryPaint.length > 0 && geometryPaint.length === referenceGeometry.length
        && geometryPaint.every((paint, index) => {
          const referenceNode = referenceGeometry[index]!;
          const stroke = referenceNode.getAttribute('stroke') ?? parsed!.getAttribute('stroke') ?? 'none';
          const fill = referenceNode.getAttribute('fill') ?? parsed!.getAttribute('fill') ?? 'none';
          const expectedStroke = stroke === 'currentColor' ? css.color : stroke;
          const expectedFill = fill === 'currentColor' ? css.color : fill;
          const hasStroke = expectedStroke !== 'none' && parseFloat(paint.strokeWidth) > 0 && Number(paint.strokeOpacity) > 0;
          const hasFill = expectedFill !== 'none' && Number(paint.fillOpacity) > 0;
          return paint.visible && Number(paint.opacity) > 0 && (hasStroke || hasFill)
            && paint.stroke === expectedStroke && paint.fill === expectedFill;
        });
      const words = (value: string) => clean(value).toLowerCase().replace(/\binput\b/g, 'in').replace(/\boutput\b/g, 'out').split(/[^a-z0-9]+/).filter(Boolean);
      const claimedWords = words(label), drawnWords = words(drawnLabel);
      const labelCorroborated = drawnWords.length > 0 && claimedWords.length > 0
        && (claimedWords.every(word => drawnWords.includes(word)) || drawnWords.every(word => claimedWords.includes(word)));
      readings.push({ medium: 'icon', kind, concept, label, icon, signature: shape(svg),
        color: css.stroke === 'none' ? css.fill : css.stroke, background: backgroundFor(svg),
        ...(concept.startsWith('model:') ? contrastFor(css.stroke === 'none' ? css.fill : css.stroke, backgroundFor(svg), 3) : {}),
        selector: `${svg.tagName}.${[...svg.classList].join('.')}`,
        unavailable: svg.closest('[data-field-unavailable="true"]') !== null,
        shapeMatches: parsed !== null && shape(parsed) === shape(svg),
        declaredIconMatches: !declaredIcon || declaredIcon === icon, paintMatches, labelCorroborated, geometryPaint });
    }
    // Chart marks and swatches have no Lucide class but still carry meaning.
    // Discover all painted SVG geometry plus the shipped CSS mark classes;
    // never infer a model/series merely from its actual colour (that would
    // conceal the very legend mismatch AC3 is meant to detect).
    const graphicSelector = 'svg:not(.lucide) path, svg:not(.lucide) circle, svg:not(.lucide) rect, svg:not(.lucide) line, svg:not(.lucide) polygon, svg:not(.lucide) polyline, .local-share-swatch, .local-tier-bar-track > span, .bar-fill, .usage-model-swatch, .usage-model-legend i, .usage-tokens-fill, .usage-token-pair > i, .ins-seg, .ins-fill, .ins-dot, .ins-heat-cell, .ins-money-paid, .ins-money-saved, .ins-money-baseline, .overview-volume-track > span, .usage-donut'
      // Live review 2026-10-26: Evidence's routing and money figures are hatched ranked bars; only these two panels'
      // bars join the census (each other chart's bars are one chart concept in many model colours).
      + ', [data-panel-title="MODEL ROUTING"] .rb-bar, [data-panel-title="SAVINGS vs CLOUD BASELINE"] .rb-bar, [data-panel-title="TOKEN USAGE"] .rb-bar';
    for (const el of body.querySelectorAll(graphicSelector)) {
      if (!visible(el) || el.closest('svg.lucide')) continue;
      const css = getComputedStyle(el);
      const paints = el instanceof SVGElement
        ? [['fill', css.fill], ['stroke', css.stroke]]
        // A hatched mark is a gradient drawn in currentColor (live review 2026-10-26): its paint is the element's colour.
        : [['background', css.backgroundImage === 'none' ? css.backgroundColor
          : /gradient/.test(css.backgroundImage) && /currentcolor/i.test(css.backgroundImage) ? css.color
          : /gradient/.test(css.backgroundImage) && css.backgroundImage.includes(css.color) ? css.color : css.backgroundImage]];
      const owner = el.closest('[data-semantic-concept]');
      const field = el.closest('[data-field-tone]')?.getAttribute('data-field-tone');
      const tier = el.closest('[data-tier]')?.getAttribute('data-tier');
      const concept = owner?.getAttribute('data-semantic-concept') || (field ? `field:${field}` : tier ? `tier:${tier}` : '');
      const structural = el.closest('[data-identity-decoration]')?.getAttribute('data-identity-decoration')
        || (el.matches('.local-donut-track, .ins-ring-track') ? 'chart-track' : '');
      const label = clean(owner?.getAttribute('data-semantic-label') || owner?.getAttribute('aria-label')
        || el.getAttribute('aria-label') || el.closest('figure')?.getAttribute('aria-label')
        || el.closest('figure')?.querySelector('h3')?.textContent || el.closest('button')?.getAttribute('aria-label'));
      const tokenIndex = el.matches('.usage-tokens-fill') ? [...el.parentElement!.children].indexOf(el) : -1;
      const tokenLegend = tokenIndex >= 0 ? el.closest('.usage-tokens-series')?.querySelectorAll('.usage-tokens-legend li')[tokenIndex] : null;
      const legendButton = el.closest('.usage-model-legend button');
      const modelName = clean(el.getAttribute('data-model-id')
        || el.closest('.ins-ring')?.querySelector('.ins-ring-name')?.textContent
        || el.closest('.barrow')?.querySelector('.lab.local-model-identity')?.getAttribute('title')
        || el.closest('.barrow')?.querySelector('.lab.local-model-identity')?.textContent
        || (el.closest('[data-panel-title="MODEL ROUTING"], [data-panel-title="TOKEN USAGE"]') ? el.closest('[data-ranked-item]')?.getAttribute('data-ranked-item') : '')
        || el.closest('.overview-volume-bars > button')?.querySelector('[data-field-tone="model"]')?.textContent
        || (el.matches('.usage-model-swatch') ? el.closest('button')?.textContent : '')
        || tokenLegend?.textContent?.replace(/: [\d,\s]+$/, '')
        || (legendButton ? [...legendButton.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('') : '')
        || el.closest('[data-model]')?.getAttribute('data-model'));
      const tierName = clean(el.closest('.overview-volume-bars > button')?.querySelector('[data-field-tone="tier"]')?.textContent
        || el.closest('.local-tier-bar-select')?.querySelector('.local-tier-bar-name')?.textContent
        || (el.matches('.local-share-swatch') ? el.closest('button')?.getAttribute('aria-label')?.replace(/^Inspect /, '') : ''));
      // Non-icon chart geometry records its measured paint and visible series
      // meaning. It is not an icon+colour pair: numeric heatmap intensity and
      // chart backgrounds are not new semantic identities. AC3's focused tests
      // compare actual model marks to legends; this census keeps the raw paint.
      const qualityTone = el.closest('.ev-qg-bar') && (field === 'pass' || field === 'fail') ? field
        : el.matches('.ev-qg-bar > .bar-fill.m-green') ? 'pass'
        : el.matches('.ev-qg-bar > .bar-fill.m-red') ? 'fail' : '';
      const qualityLabel = qualityTone ? clean(el.closest('.ev-qg-bar')?.parentElement
        ?.querySelector(`[data-field-tone="${qualityTone}"] .note`)?.textContent) : '';
      // Exact retained Savings-panel labels preserve the legacy falsifier;
      // arbitrary .barrow labels never make a money figure a model identity.
      const financeLabel = el.closest('[data-panel-title="SAVINGS vs CLOUD BASELINE"]')
        ? clean(el.closest('.barrow')?.querySelector('.lab')?.textContent || el.closest('[data-ranked-item]')?.querySelector('.rb-name')?.textContent) : '';
      const financeTones: Record<string, string> = { 'Cloud baseline cost': 'baseline', 'Local / delegated cost': 'cost', Saved: 'savings' };
      const financeTone = financeTones[financeLabel] ?? '';
      const boundField = financeTone || (qualityTone && qualityLabel ? qualityTone : '')
        || (el.matches('.bar-fill') && ['pass', 'fail', 'baseline', 'cost', 'savings'].includes(field ?? '') ? field! : '');
      const graphicConcept = structural ? '' : concept || (boundField ? `field:${boundField}` : modelName ? `model:${modelName}` : tierName ? `tier:${tierName}`
        : el.matches('.ins-heat-cell') ? 'metric:activity-by-hour'
        : label ? `chart:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '');
      for (const [paintKind, color] of paints) {
        if (['none', 'transparent', 'rgba(0, 0, 0, 0)'].includes(color!)) continue;
        const visibleTierLabel = tier ? clean([...body.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === `Inspect ${tier}`)?.textContent) : '';
        const backing = backgroundFor(el instanceof SVGElement ? el : el.parentElement);
        const unavailable = el.closest('[data-field-unavailable="true"]') !== null;
        readings.push({ medium: 'graphic', kind: graphicConcept ? 'semantic' : structural ? 'decoration' : 'unmapped',
          concept: graphicConcept || (structural ? `decoration:${structural}` : ''), label: financeLabel || qualityLabel || label || modelName || tierName || visibleTierLabel || structural || '',
          icon: '', signature: '', color: color!, background: backing,
          ...compareFieldPaint(graphicConcept, color!, unavailable),
          ...(graphicConcept.startsWith('model:') ? contrastFor(color!, backing, 3) : {}),
          selector: `${el.tagName}.${[...el.classList].join('.')}:${paintKind}`,
          unavailable,
          shapeMatches: true, declaredIconMatches: true });
      }
    }
    // Measure actual model text, including value spans outside the icon's
    // direct parent. Text nodes retain their own computed ink and backing.
    const textWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (textWalker.nextNode()) {
      const node = textWalker.currentNode, el = node.parentElement;
      if (!el || !clean(node.textContent) || el.closest('svg, .sr-only') || !visible(el)) continue;
      const owner = el.closest('.local-model-identity, [data-semantic-concept^="model:"], [data-field-tone="model"]');
      if (!owner) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      if (![...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1)) continue;
      const model = owner.getAttribute('data-semantic-concept')?.replace(/^model:/, '')
        || owner.getAttribute('data-model') || clean(owner.textContent);
      const ink = getComputedStyle(el).color, backing = backgroundFor(el);
      readings.push({ medium: 'text', kind: 'semantic', concept: `model:${model}`, label: clean(node.textContent),
        icon: '', signature: '', color: ink, background: backing, selector: `${el.tagName}.${[...el.classList].join('.')}:text`,
        unavailable: el.closest('[data-field-unavailable="true"]') !== null, shapeMatches: true, declaredIconMatches: true,
        ...contrastFor(ink, backing, 4.5) });
    }
    for (const el of body.querySelectorAll('*')) {
      if (!visible(el) || el instanceof SVGElement) continue;
      for (const pseudo of ['::before', '::after']) {
        const css = getComputedStyle(el, pseudo);
        if (['none', 'normal'].includes(css.content) || css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') continue;
        if (!(parseFloat(css.width) > 0 && parseFloat(css.height) > 0)) continue;
        const color = css.backgroundImage !== 'none' ? css.backgroundImage : css.backgroundColor;
        if (['none', 'transparent', 'rgba(0, 0, 0, 0)'].includes(color)) continue;
        const semantic = el.closest('[data-semantic-concept]');
        const field = el.closest('[data-field-tone]')?.getAttribute('data-field-tone');
        let concept = semantic?.getAttribute('data-semantic-concept') || (field ? `field:${field}` : '');
        let structural = el.closest('[data-identity-decoration]')?.getAttribute('data-identity-decoration');
        let action = '';
        // These exact existing pseudo-elements are control affordances or
        // connector geometry, not unnamed semantic icons. State dots remain
        // semantic and retain their measured paint in the census.
        if (el.matches('.mvp-nav-item.active') && pseudo === '::before') structural = 'active-navigation-indicator';
        if (el.matches('.developer-switch') && pseudo === '::after') action = 'action:developer-setting-knob';
        if (el.matches('.widget-live') && pseudo === '::before') concept = 'state:live';
        if (el.matches('.local-dashboard-steps > li')) {
          if (pseudo === '::after') structural = 'timeline-connector';
          if (pseudo === '::before') {
            const outcome = el.getAttribute('data-outcome');
            concept = outcome === 'succeeded' || outcome === 'passed' ? 'field:pass'
              : outcome === 'failed' ? 'field:fail' : 'field:unavailable';
          }
        }
        const unavailable = el.closest('[data-field-unavailable="true"]') !== null;
        readings.push({ medium: 'graphic', kind: action ? 'action' : concept ? 'semantic' : structural ? 'decoration' : 'unmapped',
          concept: action || concept || (structural ? `decoration:${structural}` : ''),
          label: clean(semantic?.getAttribute('data-semantic-label') || el.getAttribute('aria-label') || el.textContent || labelFor(el)),
          icon: '', signature: '', color, background: backgroundFor(el),
          ...(!action && !structural ? compareFieldPaint(concept, color, unavailable) : {}),
          selector: `${el.tagName}.${[...el.classList].join('.')}${pseudo}`,
          unavailable,
          shapeMatches: true, declaredIconMatches: true });
      }
    }
    return readings;
  }, references);
}

function defects(states: State[]): string[] {
  const errors = new Set<string>();
  const identities = new Map<string, Set<string>>();
  const owners = new Map<string, Set<string>>();
  for (const state of states) {
    if (!state.readings.length) errors.add(`${state.destination}/${state.theme}: empty census`);
    for (const row of state.readings) {
      const at = `${state.destination}/${state.theme}/developer=${state.developer}: ${row.label || row.selector}`;
      if (row.kind === 'unmapped') errors.add(`${at}: unmapped ${row.icon}`);
      if (!row.shapeMatches || !row.declaredIconMatches) errors.add(`${at}: icon metadata does not match drawn SVG`);
      if (row.kind !== 'semantic') continue;
      if (!row.label) errors.add(`${at}: semantic icon lacks a readable label`);
      if (row.contrast !== undefined && row.contrastThreshold !== undefined && row.contrast < row.contrastThreshold)
        errors.add(`${at}: ${row.medium} contrast ${row.contrast.toFixed(3)} is below ${row.contrastThreshold}`);
      if (row.canonicalFieldColorMatches === false) errors.add(`${at}: graphic paint differs from canonical ${row.concept} field colour ${row.canonicalFieldColor}`);
      if (row.medium !== 'icon' && !(row.medium === 'graphic' && row.concept.startsWith('field:'))) continue;
      if (row.medium === 'icon') {
        if (!row.paintMatches) errors.add(`${at}: child geometry paint or visibility differs from canonical icon`);
        if (!row.labelCorroborated) errors.add(`${at}: semantic label is not corroborated by visible text`);
      }
      const variant = `${state.theme}/${row.unavailable ? 'unavailable' : 'available'}`;
      const identityKey = `${variant}/${row.medium}/${row.concept}`;
      const pair = `${row.signature}/${row.color}`;
      const choices = identities.get(identityKey) ?? new Set<string>();
      choices.add(pair); identities.set(identityKey, choices);
      // AC1 prohibits a shared icon+colour pair, not independent colour reuse.
      // Field graphics share a colour identity across destinations. Model
      // series and numeric intensity retain their own AC3 legend checks.
      if (row.medium === 'icon') {
        const pairKey = `${variant}/${pair}`;
        const concepts = owners.get(pairKey) ?? new Set<string>();
        concepts.add(row.concept); owners.set(pairKey, concepts);
      }
    }
  }
  for (const [key, values] of identities) if (values.size !== 1) errors.add(`${key}: ${values.size} drawn icon/colour identities`);
  for (const [key, concepts] of owners) if (concepts.size > 1) errors.add(`${key}: shared by ${[...concepts].join(', ')}`);
  return [...errors];
}

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

// OMN-21166 part 28a (Lakshman 2026-10-27, grey icons with unique glyphs): the headline icons are one readable grey; each
// concept stays unique by its own glyph (AC1 is checked by the census below), and its colour lives on its chart marks.
test('core headline icons are one readable grey, each its own glyph, with readable contrast', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  await expect(page.locator('.local-overview-summary article')).toHaveCount(5); // OMN-21166 live review 2026-10-25: Delegation Quality is the fifth headline card.
  const readings = [];
  // Broad semantic hue ranges assert the approved meaning, not implementation
  // hex literals. The computed SVG paint, label ink and real card background
  // are measured independently of the CSS custom-property declaration.
  const concepts = [
    { label: 'Actual spend', family: 'amber', hue: [20, 65] },
    { label: 'Savings', family: 'teal', hue: [150, 200] },
    { label: 'Agent calls', family: 'blue', hue: [205, 245] },
    { label: 'Tokens processed', family: 'violet', hue: [250, 295] },
    // OMN-21166 live review 2026-10-25: the fifth card's heading icon keeps the site-wide quality identity (one concept,
    // one colour on every page, checked by the AC4 census); its 3px edge is the green pass colour (AC82).
    { label: 'Delegation Quality', family: 'teal-green quality ink', hue: [150, 200] },
  ];
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') ?? 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
    await settleStyles(page);
    const colors = [];
    for (const concept of concepts) {
      const card = page.locator('.local-overview-summary article').filter({ has: page.getByRole('heading', { name: concept.label, exact: true }) });
      await expect(card).toHaveCount(1);
      await expect(card.locator('h2 svg')).toHaveCount(1);
      const measured = await card.evaluate(el => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        const rgba = (color: string) => {
          if (!CSS.supports('color', color)) throw new Error(`Unsupported computed colour ${color}`);
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data];
          return [channels[0]!, channels[1]!, channels[2]!, channels[3]! / 255];
        };
        const rgb = (color: string) => rgba(color).slice(0, 3);
        const background = (node: Element) => {
          const ancestors: Element[] = [];
          for (let parent: Element | null = node; parent; parent = parent.parentElement) ancestors.push(parent);
          let back = [255, 255, 255];
          for (const parent of ancestors.reverse()) {
            const front = rgba(getComputedStyle(parent).backgroundColor);
            back = back.map((channel, index) => front[index]! * front[3]! + channel * (1 - front[3]!));
          }
          return `rgb(${back.map(Math.round).join(', ')})`;
        };
        const luminance = (color: string) => rgb(color).map(c => c / 255)
          .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
          .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i]!, 0);
        const contrast = (a: string, b: string) => {
          const front = rgba(a), back = rgba(b);
          const rendered = `rgb(${[0, 1, 2].map(index => front[index]! * front[3]! + back[index]! * (1 - front[3]!)).join(', ')})`;
          const values = [luminance(rendered), luminance(b)].sort((x, y) => y - x);
          return (values[0]! + .05) / (values[1]! + .05);
        };
        const icon = el.querySelector('h2 svg')!;
        const color = getComputedStyle(icon).color;
        const [r, g, b] = rgb(color).map(c => c / 255);
        const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), delta = max - min;
        const hue = delta === 0 ? null : (((max === r ? (g! - b!) / delta : max === g ? (b! - r!) / delta + 2 : (r! - g!) / delta + 4) * 60 + 360) % 360);
        const label = el.querySelector('h2')!;
        const value = el.querySelector('.local-dashboard-metric')!;
        return { color, hue, background: background(icon), iconContrast: contrast(color, background(icon)),
          textContrast: contrast(getComputedStyle(label).color, background(label)),
          valueContrast: contrast(getComputedStyle(value).color, background(value)) };
      });
      readings.push({ theme, ...concept, ...measured });
      colors.push(measured.color);
      // Persist measurements before an assertion: the failed base is an artifact.
      writeFileSync(info.outputPath('core-palette-contrast.json'), JSON.stringify(readings, null, 2));
      expect(measured.hue, `${concept.label} icon is grey`).toBeNull();
      expect(measured.iconContrast, `${concept.label} icon/background`).toBeGreaterThanOrEqual(3);
      expect(measured.textContrast, `${concept.label} caption/background`).toBeGreaterThanOrEqual(4.5);
      expect(measured.valueContrast, `${concept.label} value/background`).toBeGreaterThanOrEqual(4.5);
    }
    expect(new Set(colors).size, 'one interface grey').toBe(1);
    const glyphs = await page.locator('.local-overview-summary article h2 svg').evaluateAll(els => els.map(el => el.getAttribute('data-field-icon')));
    expect(new Set(glyphs).size, 'each headline concept keeps its own glyph').toBe(5);
    await page.screenshot({ path: info.outputPath(`core-palette-${theme}.png`), fullPage: true });
  }
});

test('AC4 census detects duplicate pairs, forged metadata, altered geometry paint, hidden icons and absent visible labels', async ({ page }, info) => {
  const svg = renderToStaticMarkup(createElement(icons.BrainCircuit));
  await page.setContent(`<main><h1>Collector positive control</h1>
    <p data-semantic-concept="field:model" data-semantic-label="Model">${svg}Model</p></main>`);
  const state = (readings: Reading[]): State[] => [{ destination: 'local-workflow', theme: 'light', developer: false,
    capturedAt: new Date().toISOString(), source: 'planted collector control', readings }];
  const valid = await collect(page);
  expect(valid).toHaveLength(1);
  expect(defects(state(valid))).toEqual([]);
  await page.locator('main').evaluate(main => {
    const duplicate = main.querySelector('p')!.cloneNode(true) as Element;
    duplicate.setAttribute('data-semantic-concept', 'field:unrelated');
    main.append(duplicate);
  });
  expect(defects(state(await collect(page))).join('\n')).toContain('shared by');
  await page.locator('main p').last().evaluate(el => el.remove());
  await page.locator('svg').evaluate(el => el.setAttribute('data-semantic-icon', 'bot'));
  expect(defects(state(await collect(page))).join('\n')).toContain('metadata');
  await page.locator('svg').evaluate(el => el.removeAttribute('data-semantic-icon'));
  const geometry = page.locator('svg path').first();
  await geometry.evaluate(el => (el as SVGElement).style.stroke = 'rgb(255, 0, 0)');
  expect(defects(state(await collect(page))).join('\n')).toContain('child geometry paint or visibility');
  await geometry.evaluate(el => el.removeAttribute('style'));
  expect(defects(state(await collect(page)))).toEqual([]);
  const stylesheet = await page.addStyleTag({ content: 'p svg path { stroke: rgb(255, 0, 0) !important; }' });
  expect(defects(state(await collect(page))).join('\n')).toContain('child geometry paint or visibility');
  await stylesheet.evaluate(el => el.remove());
  expect(defects(state(await collect(page)))).toEqual([]);
  await geometry.evaluate(el => (el as SVGElement).style.opacity = '0');
  expect(defects(state(await collect(page))).join('\n')).toContain('child geometry paint or visibility');
  await geometry.evaluate(el => el.removeAttribute('style'));
  expect(defects(state(await collect(page)))).toEqual([]);
  await page.locator('svg').evaluate(el => (el as SVGElement).style.opacity = '0');
  expect(defects(state(await collect(page))).join('\n')).toContain('child geometry paint or visibility');
  await page.locator('svg').evaluate(el => el.removeAttribute('style'));
  expect(defects(state(await collect(page)))).toEqual([]);
  await page.locator('p').evaluate(el => [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove()));
  expect(defects(state(await collect(page))).join('\n')).toContain('semantic label is not corroborated by visible text');
  await page.locator('p').evaluate(el => el.append('Model'));
  expect(defects(state(await collect(page)))).toEqual([]);
  await page.locator('main').evaluate(main => {
    (main as HTMLElement).style.backgroundColor = 'white';
    const layer = document.createElement('div'); layer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    const label = main.querySelector('p')!;
    (label as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
    label.replaceWith(layer); layer.append(label);
  });
  const alphaControl = await collect(page);
  const backingChannels = alphaControl[0]!.background.match(/[\d.]+/g)!.map(Number);
  // Half-white over half-black over opaque white is approximately 191 sRGB,
  // rather than either nearest translucent layer or a swatch's own paint.
  for (const channel of backingChannels) expect(channel).toBeGreaterThanOrEqual(190);
  for (const channel of backingChannels) expect(channel).toBeLessThanOrEqual(192);
  await page.locator('main').evaluate(main => {
    const layer = main.querySelector('div')!, label = layer.querySelector('p')!;
    layer.replaceWith(label); label.removeAttribute('style'); main.removeAttribute('style');
  });
  expect(defects(state(await collect(page)))).toEqual([]);
  await page.locator('p').evaluate(el => el.removeAttribute('data-semantic-concept'));
  expect(defects(state(await collect(page))).join('\n')).toContain('unmapped');
  await page.locator('main').evaluate(el => el.replaceChildren());
  expect(defects(state(await collect(page))).join('\n')).toContain('empty census');
  writeFileSync(info.outputPath('collector-controls.json'), JSON.stringify({ valid, alphaControl, detected: ['duplicate pair', 'forged icon', 'inline child stroke override', 'stylesheet child stroke override', 'child opacity zero', 'SVG opacity zero', 'metadata-only label', 'alpha backing composition', 'unmapped concept', 'empty census'] }, null, 2));
});

// Follow-up failure modes: non-icon field graphics can drift across pages;
// token direction bars can retain a legacy series colour in either theme.
test('AC4 collector rejects conflicting non-icon field graphic colours', async ({ page }, info) => {
  // OMN-21166 part 17 AC114: "Tokens in vs out by model" is hatched grouped bars (GroupedBars): a list item per model, a
  // column per direction, a bar (.gdb-bar.ins-seg) in the direction's colour. The control plants that markup; both bars
  // carry the tokens-in tone because the control only needs one mismatching paint.
  await page.setContent(`<style>:root { --field-tokens-in: #075985; }
    ul.gdb-plot { list-style:none;margin:0;padding:0; } .gdb-group { display:flex;gap:3px; } .gdb-col { display:block; }
    .gdb-bar.ins-seg { display:block;width:100px;height:8px;color:#075985;background:#075985; }</style>
    <main><figure aria-label="Tokens in vs out by model"><ul class="ins-bars gdb-plot gdb-plot--list" aria-label="Token counts by model">
      <li class="ins-bar gdb-day" tabindex="0" aria-label="model-a: 100 tokens in, 20 tokens out"><span class="gdb-group">
        <span class="gdb-col" data-series="in" data-field-tone="tokens-in"><span class="gdb-bar ins-seg"></span></span>
        <span class="gdb-col" data-series="out" data-field-tone="tokens-in"><span class="gdb-bar ins-seg"></span></span>
      </span></li>
    </ul></figure></main>`);
  const state = (readings: Reading[]): State[] => [{ destination: 'local-usage', theme: 'light', developer: false,
    capturedAt: new Date().toISOString(), source: 'planted graphic collector control', readings }];
  const valid = await collect(page);
  expect(valid.filter(row => row.medium === 'graphic')).toHaveLength(2);
  expect(defects(state(valid))).toEqual([]);
  await page.locator('.gdb-bar').last().evaluate(el => (el as HTMLElement).style.backgroundColor = '#7e22ce');
  const wrong = await collect(page);
  const errors = defects(state(wrong));
  writeFileSync(info.outputPath('graphic-collector-control.json'), JSON.stringify({ valid, wrong, errors }, null, 2));
  expect(errors.join('\n')).toContain('field:tokens-in');
  expect(errors.join('\n')).toContain('graphic');
  // Cross-page drift must also be rejected independently of the canonical
  // comparison, so a future unmeasured paint cannot silently bypass it.
  const withoutCanonical = wrong.map(row => {
    const reading = { ...row };
    delete reading.canonicalFieldColor; delete reading.canonicalFieldColorMatches;
    return reading;
  });
  expect(defects(state(withoutCanonical)).join('\n')).toContain('graphic');
});

test('AC4 Usage token-direction graphics match canonical fields in both themes', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [prefix + 'usage-by-model-day.v1']: [{
    usage_day: new Date().toISOString().slice(0, 10), model_id: 'model-a',
    input_tokens: 100, output_tokens: 20, measured_cost_usd: '1', call_count: 1,
    unmeasured_call_count: 0, cost_tier_name: 'local',
  }] });
  await page.goto('/usage');
  // OMN-21166 part 13: "Tokens in vs out by model" is under the closed "More usage" section.
  await page.getByText('More usage', { exact: true }).press('Enter');
  const figure = page.getByRole('figure', { name: 'Tokens in vs out by model', exact: true });
  // Part 17 AC114: the model's pair is one focusable list item (hatched grouped bars) whose name carries both counts.
  await expect(figure.getByRole('listitem', { name: /model-a: 100 tokens in, 20 tokens out/ })).toHaveCount(1);
  const states: State[] = [];
  for (const theme of ['light', 'dark']) {
    if (!(await page.locator('body').getAttribute('class'))?.split(' ').includes(`theme-${theme}`))
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
    await settleStyles(page);
    const readings = (await collect(page)).filter(row => row.medium === 'graphic' && /^field:tokens-(in|out)$/.test(row.concept));
    expect(readings).toHaveLength(2);
    states.push({ destination: 'local-usage', theme, developer: false, capturedAt: new Date().toISOString(),
      source: sourceSha, readings });
    writeFileSync(info.outputPath('token-direction-graphics.json'), JSON.stringify({ states, defects: defects(states) }, null, 2));
    await page.screenshot({ path: info.outputPath(`token-direction-${theme}.png`), fullPage: true });
    for (const row of readings) {
      expect(row.canonicalFieldColor, `${row.concept} must be measured against the canonical field`).toBeDefined();
      expect(row.canonicalFieldColorMatches, `${theme}: ${row.concept} actual graphic paint`).toBe(true);
    }
  }
  expect(defects(states)).toEqual([]);
});

test('AC4 eleven-destination light/dark icon census includes expanded and Developer states', async ({ page }, info) => {
  test.setTimeout(180_000);
  await serveCharts(page, rows);
  const states: State[] = [];
  for (const destination of destinations) {
    await page.goto(PAGE_PATHS[destination] + (destination === 'local-workflow' ? '?correlation_id=chart-run-a' : ''));
    await expect(page.locator('.breadcrumbs .cur')).toHaveText(PAGE_LABELS[destination]);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.main')).not.toContainText(/Dashboard is unavailable|Loading/);
    // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs and its field view are deleted from Overview; only Runs has them.
    if (destination === 'local-runs') await revealRunFields(page);
    // OMN-21166 part 18 AC125: the step boxes ([data-step-kind]) are removed; the six steps are the timeline's.
    if (destination === 'local-workflow') await expect(page.locator('ol.local-dashboard-steps > li')).toHaveCount(6);
    if (destination === 'delegation-evidence') {
      const disclosure = page.getByRole('button', { name: 'Toggle details for chart-run-a', exact: true });
      if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.row-detail')).toContainText('chart-run-a');
    }
    for (const disclosure of await page.locator('main details').all()) {
      if (await disclosure.isVisible() && await disclosure.getAttribute('open') === null) await disclosure.locator(':scope > summary').press('Enter');
    }
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme') ?? 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      for (const developer of [false, true]) {
        const toggle = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
        if (await toggle.getAttribute('aria-checked') !== String(developer)) await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', String(developer));
        await settleStyles(page);
        const readings = await collect(page);
        states.push({ destination, theme, developer, capturedAt: new Date().toISOString(),
          source: sourceSha, readings });
        writeFileSync(info.outputPath('identity-census.json'), JSON.stringify({ data: 'governed response fixtures', states, defects: defects(states) }, null, 2));
        await page.screenshot({ path: info.outputPath(`${destination}-${theme}-developer-${developer}.png`), fullPage: true });
        if (destination === 'delegation-evidence') {
          for (const tone of ['pass', 'fail', 'baseline', 'cost', 'savings']) {
            expect(readings.some(row => row.medium === 'graphic' && row.concept === `field:${tone}` && row.canonicalFieldColor !== undefined),
              `finite Evidence ${tone} bar is present and compared with canonical field ink`).toBe(true);
          }
          expect(readings.some(row => row.concept === 'model:Cloud baseline cost' || row.concept === 'model:Local / delegated cost' || row.concept === 'model:Saved'),
            'financial labels are never recorded as model identities').toBe(false);
        }
      }
    }
  }
  expect(states).toHaveLength(40);
  expect(new Set(states.map(state => state.destination)).size).toBe(10);
  expect(states.every(state => state.readings.some(row => row.kind === 'semantic')), 'positive semantic anchors on each loaded page').toBe(true);
  expect(sourceSha, 'census resolves exact tested source SHA').toMatch(/^[0-9a-f]{40}$/);
  expect(defects(states)).toEqual([]);
});

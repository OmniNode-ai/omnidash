// @vitest-environment jsdom
// OMN-23330 AC27 (operator 2026-11-09: "why small text not colorsed - use color ... different for different purpose and
// vice versa"): every figure and named thing in a headline card's caption on Overview and Delegation Evidence wears the
// colour of the concept it names, one concept one colour on every page, two concepts never one colour.
// Failure mode F15: a caption figure or name is uncoloured, or one concept wears two colours, or two concepts share one.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CaptionLine, captionParts } from '@/components/dashboard/CaptionLine';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { QualityCard, headlineHoverLines } from '@/pages/LocalDashboardPage';

const ROOT = path.resolve(__dirname, '../../..');
const ROW = {
  window_kind: 'all', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', runs_total: 2833,
  runs_measured: 2746, runs_unknown_tokens: 87, runs_unknown_spend: 0, tokens_in: 3250000, tokens_out: 1540000,
};
/** The drawn caption lines of the Overview cards and the Delegation Evidence cards, as the pages build them. */
const OVERVIEW = ['overview-spend', 'overview-savings', 'overview-measured'].flatMap((id) => headlineHoverLines(id, ROW, null));
const EVIDENCE = ['Of 2.83K runs', 'Unknown-token runs excluded: 87', 'Unknown-spend runs excluded: 0',
  'vs claude-sonnet-5-5 · pricing v1.0.0', 'avg 9.5 s latency', '2,517 of 2,833 runs passed the quality gate',
  '316 failed · deterministic checks'];

/** What each caption concept is, so one concept is one tone wherever it appears. */
const CONCEPT_OF = (text: string, line: string): string | null => {
  if (text === 'What you paid') return 'cost';
  // A model name may be drawn unbroken, with non-breaking hyphens (U+2011).
  if (text.replaceAll('‑', '-') === 'claude-sonnet-5-5') return 'baseline';
  if (/^\d[\d,]*$/.test(text) && line.startsWith(`${text} failed`)) return 'fail';
  if (/runs measured$/.test(line) && line.startsWith(text)) return 'calls';
  if (/runs passed the quality gate$/.test(line) && line.startsWith(text)) return 'pass';
  if (/^(2,833|2\.83K)$/.test(text)) return 'count';
  if (/without (token counts|spend)|excluded/.test(line) && /^\d/.test(text)) return 'run-unknown';
  if (/latency$/.test(line)) return 'duration';
  return null;
};

describe('OMN-23330 AC27: caption figures and names wear their concept colour', () => {
  it.each([...OVERVIEW, ...EVIDENCE])('every figure and the model name in "%s" is toned, with its concept tone', (line) => {
    const parts = captionParts(line);
    expect(parts.map((part) => part.text).join('')).toBe(line);
    // A figure or the model name; the pricing version is a label, not a figure.
    const figures = parts.filter((part) => (/\d/.test(part.text) && !/^ · pricing/.test(part.text))
      || part.text.replaceAll('‑', '-').includes('claude-sonnet-5-5'));
    for (const part of figures) {
      expect({ text: part.text, tone: part.tone ?? null }).toEqual({ text: part.text, tone: CONCEPT_OF(part.text, line) });
    }
  });

  it('positive control: the lines under test carry figures and names to tone', () => {
    const toned = [...OVERVIEW, ...EVIDENCE].flatMap(captionParts).filter((part) => part.tone);
    expect(toned.length).toBeGreaterThanOrEqual(12);
    expect(OVERVIEW).toContain('2,746 of 2,833 runs measured');
  });

  it('a state in a model\'s place ("unresolved", "Not recorded") stays neutral; only a model name is toned', () => {
    expect(captionParts('Baseline unresolved')).toEqual([{ text: 'Baseline unresolved' }]);
    expect(captionParts('Baseline Not recorded · pricing v1.0.0')).toEqual([{ text: 'Baseline Not recorded · pricing v1.0.0' }]);
    expect(captionParts('Modelled vs claude-sonnet-5-5')[1]).toEqual({ text: 'claude-sonnet-5-5', tone: 'baseline' });
  });

  it('the spend caption names spend in the spend tone', () => {
    expect(captionParts('What you paid, all time')[0]).toEqual({ text: 'What you paid', tone: 'cost' });
  });

  it('measured runs share the Agent calls figure tone and all runs keep their own, different tone', () => {
    const tones = captionParts('2,746 of 2,833 runs measured').filter((part) => part.tone).map((part) => part.tone);
    expect(tones).toEqual(['calls', 'count']);
  });

  it('each caption tone resolves to its own palette colour, so two concepts never share one', () => {
    const css = readFileSync(path.join(ROOT, 'src/styles/field-identity.css'), 'utf8');
    const ink = (tone: string) => new RegExp(`\\[data-field-tone="${tone}"\\] \\{ --field-ink: (var\\(--[\\w-]+\\)); \\}`).exec(css)?.[1];
    const tones = ['cost', 'baseline', 'calls', 'count', 'pass', 'fail', 'run-unknown', 'duration'];
    const inks = tones.map(ink);
    expect(inks.every(Boolean)).toBe(true);
    expect(new Set(inks).size).toBe(tones.length);
  });

  it('a drawn caption marks its toned parts for the stylesheet, and the stylesheet colours them', () => {
    const { container } = render(<div className="local-card-caption"><CaptionLine line="2,517 of 2,833 runs passed the quality gate" /></div>);
    expect([...container.querySelectorAll('.local-caption-tone')].map((node) => [node.textContent, node.getAttribute('data-field-tone')]))
      .toEqual([['2,517', 'pass'], ['2,833', 'count']]);
    const css = readFileSync(path.join(ROOT, 'src/styles/field-identity.css'), 'utf8');
    expect(css).toMatch(/\.local-card-caption \.local-dashboard-caption > \.local-caption-tone\[data-field-tone\] \{ color: var\(--field-ink\)/);
  });

  it('Overview Delegation quality and the KPI cards draw their captions toned (no plain caption figures)', () => {
    const quality = render(<QualityCard row={{ overall_pass_rate: 0.888, total_passed: 2517, total_checks: 2833, total_failed: 316 }} />);
    const strip = render(<KpiStrip label="Delegation summary" items={[
      { label: 'Delegations', value: '2.75K', accent: 'var(--ds-field-calls)', concept: 'calls', lines: ['Of 2.83K runs', 'Unknown-token runs excluded: 87'] },
      { label: 'Tokens', value: '4.79M', accent: 'var(--ds-field-tokens)', concept: 'tokens', lines: ['avg 9.5 s latency'] },
    ]} />);
    for (const { container } of [quality, strip]) {
      const captions = [...container.querySelectorAll('.local-card-caption .local-dashboard-caption')];
      expect(captions.length).toBeGreaterThan(0);
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const bare: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const inCaption = node.parentElement?.closest('.local-card-caption');
        if (inCaption && /\d/.test(node.textContent ?? '') && !node.parentElement?.closest('[data-field-tone]')) bare.push(node.textContent ?? '');
      }
      expect(bare).toEqual([]);
    }
  });
});

// @vitest-environment jsdom
// OMN-22168 AC6 (Lakshman 2026-11-07): the design system's Storybook page shows the token direction rows, tokens in and
// tokens out in their two colours, as a kit component, in light and dark. The kit exports TokenDirections, the
// components story renders it measured and with a count that is not served, and the story frame loads the field colours
// (field-identity.css) so the story draws the colours the pages draw.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as kit from '@/theme/design-system/components';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');

describe('AC6: the token direction rows are a kit component with a story in light and dark', () => {
  it('the component kit exports TokenDirections', () => {
    expect(typeof (kit as Record<string, unknown>).TokenDirections).toBe('function');
  });

  it('the kit component tags each direction, and an unserved count is unavailable', () => {
    const TokenDirections = (kit as unknown as { TokenDirections: (p: { input: unknown; output: unknown }) => JSX.Element }).TokenDirections;
    const { container } = render(<TokenDirections input={2954602} output={null} />);
    const rows = [...container.querySelectorAll<HTMLElement>('.local-token-direction')];
    expect(rows.map(row => [row.dataset.fieldTone, row.dataset.fieldUnavailable, row.querySelector('strong')?.textContent]))
      .toEqual([['tokens-in', 'false', '2,954,602'], ['tokens-out', 'true', 'Not measured']]);
    expect(rows.every(row => row.querySelector(':scope > svg'))).toBe(true);
  });

  it('the components story renders it, measured and unserved, and the frame loads the field colours', () => {
    const story = read('src/theme/design-system/components/components.stories.tsx');
    expect(story.match(/<TokenDirections /g)?.length).toBeGreaterThanOrEqual(2);
    expect(story).toMatch(/output=\{null\}/);
    expect(read('src/theme/design-system/story-frame.tsx')).toMatch(/import '@\/styles\/field-identity\.css'/);
  });

  it('control: the story still shows light and dark', () => {
    const story = read('src/theme/design-system/components/components.stories.tsx');
    expect(story).toMatch(/themeOverride:\s*'Light'/);
    expect(story).toMatch(/themeOverride:\s*'Dark'/);
  });
});

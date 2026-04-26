/**
 * TYPOGRAPHY REFACTOR — COMPLIANCE SCORECARD
 *
 * Runs outside the default test suite (see vitest.config.ts `exclude`).
 * Execute with: `npx vitest run src/typography-compliance.test.ts --reporter=verbose`.
 *
 * The count of FAILING tests is the refactor's progress indicator. When
 * this file passes 100%, the refactor is complete; Task 39 removes it
 * from the exclude list so it becomes a permanent regression gate.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import React from 'react';

const ROOT = resolve(__dirname, '..');
const readSrc = (relPath: string) => readFileSync(resolve(ROOT, relPath), 'utf-8');
const srcExists = (relPath: string) => existsSync(resolve(ROOT, relPath));

function listTsxRecursively(dir: string, opts: { excludeTests: boolean }): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        if (opts.excludeTests && (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.stories.tsx'))) continue;
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

describe('Phase 0: ADR', () => {
  it('ADR file exists at docs/adr/001-typography-system.md', () => {
    expect(srcExists('docs/adr/001-typography-system.md')).toBe(true);
  });
  it('ADR contains required sections', () => {
    const adr = readSrc('docs/adr/001-typography-system.md');
    for (const section of ['Context', 'Decision', 'Consequences', 'Alternatives', 'Status']) {
      expect(adr, `ADR missing "${section}" heading`).toMatch(new RegExp(`^##?\\s+${section}`, 'm'));
    }
  });
  it('CLAUDE.md links to the ADR and contains the Typography section', () => {
    const claude = readSrc('CLAUDE.md');
    expect(claude).toContain('001-typography-system.md');
    expect(claude).toMatch(/^##?\s+Typography/m);
  });
});

describe('Phase 1: Token declarations', () => {
  let css = '';
  beforeAll(() => { css = readSrc('src/styles/globals.css'); });

  const tokens: Array<[string, string]> = [
    ['--text-xs', '0.625rem'], ['--text-sm', '0.6875rem'], ['--text-md', '0.75rem'],
    ['--text-lg', '0.8125rem'], ['--text-xl', '0.875rem'], ['--text-2xl', '1rem'],
    ['--text-3xl', '1.125rem'], ['--text-4xl', '1.375rem'],
    ['--leading-tight', '1.2'], ['--leading-normal', '1.45'], ['--leading-loose', '1.65'],
    ['--weight-regular', '400'], ['--weight-medium', '500'],
    ['--weight-semibold', '600'], ['--weight-bold', '700'],
    ['--text-primary', 'var(--ink)'], ['--text-secondary', 'var(--ink-2)'],
    ['--text-tertiary', 'var(--ink-3)'], ['--text-brand', 'var(--brand)'],
    ['--text-ok', 'var(--status-ok)'], ['--text-warn', 'var(--status-warn)'],
    ['--text-bad', 'var(--status-bad)'],
  ];

  for (const [name, value] of tokens) {
    it(`declares ${name} = ${value}`, () => {
      const en = name.replace(/[-]/g, '\\-');
      const ev = value.replace(/[()]/g, '\\$&').replace(/[.]/g, '\\.');
      const pattern = new RegExp(`${en}\\s*:\\s*${ev}\\s*;`);
      expect(css).toMatch(pattern);
    });
  }

  it('no type-scale overrides under [data-theme="dark"]', () => {
    const darkBlock = css.match(/\[data-theme="dark"\][^}]*\{([^}]*)\}/)?.[1] ?? '';
    expect(darkBlock).not.toMatch(/--(text|leading|weight)-/);
  });
});

describe('Phase 2: Text + Heading components', () => {
  let Text: any = null;
  let Heading: any = null;

  // Build absolute paths at runtime so Vite's static-import analyzer
  // can't try to resolve them at test-load time (the files do not
  // exist until Tasks 6 and 8 land).
  const TEXT_MODULE = resolve(ROOT, 'src/components/ui/typography/Text.tsx');
  const HEADING_MODULE = resolve(ROOT, 'src/components/ui/typography/Heading.tsx');
  const BARREL_MODULE = resolve(ROOT, 'src/components/ui/typography/index.ts');

  beforeAll(async () => {
    if (existsSync(TEXT_MODULE)) {
      try { Text = (await import(TEXT_MODULE)).Text; } catch { /* load failed */ }
    }
    if (existsSync(HEADING_MODULE)) {
      try { Heading = (await import(HEADING_MODULE)).Heading; } catch { /* load failed */ }
    }
  });

  it('barrel: Text', async () => {
    expect(existsSync(BARREL_MODULE), 'barrel index.ts missing').toBe(true);
    expect((await import(BARREL_MODULE)).Text).toBeDefined();
  });
  it('barrel: Heading', async () => {
    expect(existsSync(BARREL_MODULE), 'barrel index.ts missing').toBe(true);
    expect((await import(BARREL_MODULE)).Heading).toBeDefined();
  });
  it('Text default renders <span>', () => {
    const { container } = render(React.createElement(Text, null, 'x'));
    expect(container.firstChild?.nodeName).toBe('SPAN');
  });
  it('Text as="div" renders <div>', () => {
    const { container } = render(React.createElement(Text, { as: 'div' }, 'x'));
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  const sizes: Array<[string, string]> = [
    ['xs', 'var(--text-xs)'], ['sm', 'var(--text-sm)'], ['md', 'var(--text-md)'],
    ['lg', 'var(--text-lg)'], ['xl', 'var(--text-xl)'], ['2xl', 'var(--text-2xl)'],
    ['3xl', 'var(--text-3xl)'], ['4xl', 'var(--text-4xl)'],
  ];
  for (const [size, cssVar] of sizes) {
    it(`Text size="${size}" → ${cssVar}`, () => {
      const { container } = render(React.createElement(Text, { size }, 'x'));
      expect((container.firstChild as HTMLElement).style.fontSize).toBe(cssVar);
    });
  }

  const colors: Array<[string, string]> = [
    ['primary', 'var(--text-primary)'], ['secondary', 'var(--text-secondary)'],
    ['tertiary', 'var(--text-tertiary)'], ['brand', 'var(--text-brand)'],
    ['ok', 'var(--text-ok)'], ['warn', 'var(--text-warn)'], ['bad', 'var(--text-bad)'],
    ['inherit', 'inherit'],
  ];
  for (const [color, cssVar] of colors) {
    it(`Text color="${color}" → ${cssVar}`, () => {
      const { container } = render(React.createElement(Text, { color }, 'x'));
      expect((container.firstChild as HTMLElement).style.color).toBe(cssVar);
    });
  }

  it('Text family="mono" → var(--font-mono)', () => {
    const { container } = render(React.createElement(Text, { family: 'mono' }, 'x'));
    expect((container.firstChild as HTMLElement).style.fontFamily).toBe('var(--font-mono)');
  });
  it('Text weight="semibold" → var(--weight-semibold)', () => {
    const { container } = render(React.createElement(Text, { weight: 'semibold' }, 'x'));
    expect((container.firstChild as HTMLElement).style.fontWeight).toBe('var(--weight-semibold)');
  });
  it('Text leading="tight" → var(--leading-tight)', () => {
    const { container } = render(React.createElement(Text, { leading: 'tight' }, 'x'));
    expect((container.firstChild as HTMLElement).style.lineHeight).toBe('var(--leading-tight)');
  });
  it('Text tabularNums → font-variant-numeric: tabular-nums', () => {
    const { container } = render(React.createElement(Text, { tabularNums: true }, '12'));
    expect((container.firstChild as HTMLElement).style.fontVariantNumeric).toBe('tabular-nums');
  });
  it('Text truncate → overflow/ellipsis/nowrap', () => {
    const { container } = render(React.createElement(Text, { truncate: true }, 'x'));
    const el = container.firstChild as HTMLElement;
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.textOverflow).toBe('ellipsis');
    expect(el.style.whiteSpace).toBe('nowrap');
  });
  it('Text style prop overrides computed (escape hatch)', () => {
    const { container } = render(
      React.createElement(Text, { size: 'md', style: { fontSize: '99px' } }, 'x')
    );
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });
  it('Text passes aria-label through', () => {
    const { container } = render(React.createElement(Text, { 'aria-label': 'hi' }, 'x'));
    expect(container.firstChild).toHaveAttribute('aria-label', 'hi');
  });
  it('Heading level=2 → h2 with var(--text-3xl) default', () => {
    const { container } = render(React.createElement(Heading, { level: 2 }, 't'));
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe('H2');
    expect(el.style.fontSize).toBe('var(--text-3xl)');
  });
});

describe('Phase 3: Storybook', () => {
  it('.storybook/main.ts exists', () => {
    expect(srcExists('.storybook/main.ts')).toBe(true);
  });
  it('.storybook/preview.tsx exists + imports globals.css + sets data-theme', () => {
    expect(srcExists('.storybook/preview.tsx')).toBe(true);
    const preview = readSrc('.storybook/preview.tsx');
    expect(preview).toContain('../src/styles/globals.css');
    expect(preview).toContain('data-theme');
  });
  it('Typography.stories.tsx exports required stories', async () => {
    const storiesPath = resolve(ROOT, 'src/components/ui/typography/Typography.stories.tsx');
    expect(existsSync(storiesPath), 'Typography.stories.tsx missing').toBe(true);
    const mod = await import(storiesPath);
    const required = [
      'ScaleShowcase', 'ColorRoles', 'Weights', 'Leadings', 'Families',
      'TabularNums', 'Truncate', 'KitchenSink_DataRow',
      'KitchenSink_ColumnHeader', 'ThemeContrast',
    ];
    for (const name of required) {
      expect(mod[name as keyof typeof mod], `missing "${name}"`).toBeDefined();
    }
  });
  it('Heading.stories.tsx exists with Levels story', async () => {
    const storiesPath = resolve(ROOT, 'src/components/ui/typography/Heading.stories.tsx');
    expect(existsSync(storiesPath), 'Heading.stories.tsx missing').toBe(true);
    const mod = await import(storiesPath);
    expect(mod.Levels).toBeDefined();
  });
});

describe('Phase 4: Migration — no inline typography in dashboard widgets', () => {
  const BAD_PATTERNS: Array<[RegExp, string]> = [
    [/\bfontSize\s*:/, 'inline fontSize'],
    [/\bfontFamily\s*:/, 'inline fontFamily'],
    [/\bfontWeight\s*:\s*[0-9]/, 'inline numeric fontWeight'],
    [/\bfontVariantNumeric\s*:/, 'inline fontVariantNumeric'],
    [/\bletterSpacing\s*:/, 'inline letterSpacing'],
    [/\btextTransform\s*:\s*['"]uppercase/, 'inline textTransform:uppercase'],
    [/\blineHeight\s*:/, 'inline lineHeight'],
    [/color\s*:\s*['"]var\(--ink/, 'inline raw --ink color (use color="primary|secondary|tertiary")'],
  ];
  const DASHBOARD_DIR = resolve(ROOT, 'src/components/dashboard');
  const files = existsSync(DASHBOARD_DIR) ? listTsxRecursively(DASHBOARD_DIR, { excludeTests: true }) : [];

  it('dashboard directory exists', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    const rel = file.replace(ROOT + '/', '');
    it(`${rel} has no forbidden inline typography`, () => {
      const content = readFileSync(file, 'utf-8');
      const hits: string[] = [];
      for (const [pattern, label] of BAD_PATTERNS) {
        const m = content.match(pattern);
        if (m) hits.push(`  • ${label}: ${JSON.stringify(m[0])}`);
      }
      expect(hits, `\n${rel} has forbidden inline typography:\n${hits.join('\n')}\n`).toEqual([]);
    });
  }
});

describe('Phase 5: ESLint rule', () => {
  it('eslint-rules/no-typography-inline.cjs exists', () => {
    expect(srcExists('eslint-rules/no-typography-inline.cjs')).toBe(true);
  });
  it('rule flags fontSize in inline style prop', async () => {
    // String-concat module name so Vite can't statically resolve —
    // eslint is a dev dep that lands in Task 34.
    const eslintModule = 'es' + 'lint';
    const { ESLint } = await import(eslintModule);
    const eslint = new ESLint({ cwd: ROOT });
    const [r] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/__lint_fixture_forbidden.tsx') }
    );
    expect(r.messages.filter((m: { ruleId?: string }) => m.ruleId?.endsWith('no-typography-inline')).length).toBeGreaterThan(0);
  });
  it('rule allows inline style inside src/components/ui/typography/', async () => {
    // String-concat module name so Vite can't statically resolve —
    // eslint is a dev dep that lands in Task 34.
    const eslintModule = 'es' + 'lint';
    const { ESLint } = await import(eslintModule);
    const eslint = new ESLint({ cwd: ROOT });
    const [r] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/components/ui/typography/__lint_fixture_allowed.tsx') }
    );
    expect(r.messages.filter((m: { ruleId?: string }) => m.ruleId?.endsWith('no-typography-inline')).length).toBe(0);
  });
});

describe('Phase 6: Docs + cleanup', () => {
  it('typography README exists', () => {
    expect(srcExists('src/components/ui/typography/README.md')).toBe(true);
  });
  it('ux-polish-checklist references typography', () => {
    expect(srcExists('docs/ux-polish-checklist.md'), 'ux-polish-checklist.md missing').toBe(true);
    expect(readSrc('docs/ux-polish-checklist.md').toLowerCase()).toContain('typography');
  });
  it('no src file references vars.font (legacy vanilla-extract font contract)', () => {
    const walkTs = (dir: string, out: string[]) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) walkTs(full, out);
        else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) {
          if (/\bvars\.font\b/.test(readFileSync(full, 'utf-8'))) out.push(full.replace(ROOT + '/', ''));
        }
      }
    };
    const offenders: string[] = [];
    walkTs(resolve(ROOT, 'src'), offenders);
    expect(offenders, `vars.font still referenced in:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

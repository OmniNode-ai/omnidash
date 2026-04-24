# Typography System Refactor — Execution Plan

**Status:** Proposed
**Author:** Drafted 2026-04-24
**Related:** OMN-22 UX polish (tangent — graduates UX work into a durable system)
**ADR:** `docs/adr/001-typography-system.md` (to be written in Phase 0)

---

## Purpose

The dashboard widgets each author typography inline: `fontSize: '0.75rem'`, `color: 'var(--ink-3)'`, `fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)'`. This works for single widgets but drifts apart across widgets that should visually match (EventStream vs. RoutingDecisionTable were off by 1px on three surfaces and differed on timestamp color because both were hand-authored from memory).

This plan replaces inline typography with a **token + component** system: CSS custom-property tokens in `globals.css`, typed `<Text>` / `<Heading>` components that resolve tokens internally, a Storybook showcase, a lint rule that prevents backsliding, and a test harness that proves compliance at every step.

---

## Scope

### In scope

- Typography tokens (size, weight, leading, text-color roles)
- `<Text>` and `<Heading>` component primitives
- Storybook setup + required showcase stories
- Migration of all dashboard widgets
- ESLint custom rule + CI wiring
- ADR + CLAUDE.md update

### Out of scope (explicitly deferred — see Phase 7)

- JSON token source (Style Dictionary / DTCG)
- Figma Tokens Studio sync
- Visual regression testing (Chromatic / Playwright visual)
- Color palette overhaul
- Spacing / sizing scale refactor
- Consolidating vanilla-extract with globals.css tokens
- Extracting components to their own npm package

Each deferred item has a named re-evaluation trigger in Phase 7.

---

## Glossary (freeze before starting)

| Term | Definition |
|---|---|
| Primitive token | Raw value, e.g. `--font-mono: "IBM Plex Mono", ...` |
| Semantic token | Role alias over primitives, e.g. `--text-primary: var(--ink)` |
| Component primitive | React component wrapping token lookups, e.g. `<Text size="sm">` |

---

## Phase order

1. **Phase -1** — Compliance test harness (the scorecard)
2. **Phase 0** — ADR + decisions
3. **Phase 1** — Token layer
4. **Phase 2** — Component primitives
5. **Phase 3** — Storybook
6. **Phase 4** — Widget migration
7. **Phase 5** — Lint enforcement
8. **Phase 6** — Docs + cleanup
9. **Phase 7** — Explicitly deferred items

Each phase ends with its corresponding describe block in `src/typography-compliance.test.ts` passing 100%.

---

# Phase -1 — Compliance Test Harness

## Intent

Before writing any production code, encode every acceptance criterion from Phases 0-6 as a concrete Vitest assertion. The file starts mostly RED and goes GREEN one phase at a time. When it's 100% GREEN, the refactor is done. No judgment calls; no retrospective "did we do it right?" — the machine decides.

## -1.1 File layout

**One file:** `src/typography-compliance.test.ts`

**Excluded from default `npm test`** to keep CI green during the refactor. Run explicitly:

```bash
npx vitest run src/typography-compliance.test.ts --reporter=verbose
```

Update `vitest.config.ts` to add to `exclude`:

```ts
exclude: [
  ...existing,
  'src/typography-compliance.test.ts',
]
```

When the refactor completes (all green), **remove the exclusion** so the suite becomes a permanent regression gate.

## -1.2 Required dependencies

Verify already installed (no new deps needed):

- `vitest`, `@testing-library/react`, `@testing-library/jest-dom` — for component assertions
- `eslint` with programmatic API — for lint-rule firing tests
- Node 18+ for `fs.readdirSync({ recursive: true })`

## -1.3 Exact file content

The entire file, verbatim. Structure: one `describe` per phase; each `it` asserts exactly one criterion.

```ts
/**
 * TYPOGRAPHY REFACTOR — COMPLIANCE SCORECARD
 *
 * Runs outside the default test suite (see vitest.config.ts `exclude`).
 * Execute with: `npx vitest run src/typography-compliance.test.ts --reporter=verbose`.
 *
 * The count of FAILING tests is the refactor's progress indicator. When
 * this file passes 100%, the refactor described in docs/plans/typography-
 * refactor.md is complete; at that point remove it from the vitest
 * `exclude` list so it becomes a permanent regression gate.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import React from 'react';

// ---------- Helpers ----------

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

// ============================================================
// PHASE 0 — ADR + CLAUDE.md update
// ============================================================
describe('Phase 0: ADR', () => {
  it('ADR file exists at docs/adr/001-typography-system.md', () => {
    expect(srcExists('docs/adr/001-typography-system.md')).toBe(true);
  });

  it('ADR contains required sections (Context, Decision, Consequences, Alternatives, Status)', () => {
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

// ============================================================
// PHASE 1 — Token declarations in globals.css
// ============================================================
describe('Phase 1: Token declarations', () => {
  let css = '';
  beforeAll(() => { css = readSrc('src/styles/globals.css'); });

  const tokens: Array<[string, string]> = [
    // Type scale
    ['--text-xs',   '0.625rem'],
    ['--text-sm',   '0.6875rem'],
    ['--text-md',   '0.75rem'],
    ['--text-lg',   '0.8125rem'],
    ['--text-xl',   '0.875rem'],
    ['--text-2xl',  '1rem'],
    ['--text-3xl',  '1.125rem'],
    ['--text-4xl',  '1.375rem'],
    // Leading
    ['--leading-tight',  '1.2'],
    ['--leading-normal', '1.45'],
    ['--leading-loose',  '1.65'],
    // Weight
    ['--weight-regular',  '400'],
    ['--weight-medium',   '500'],
    ['--weight-semibold', '600'],
    ['--weight-bold',     '700'],
    // Color roles
    ['--text-primary',   'var(--ink)'],
    ['--text-secondary', 'var(--ink-2)'],
    ['--text-tertiary',  'var(--ink-3)'],
    ['--text-brand',     'var(--brand)'],
    ['--text-ok',        'var(--status-ok)'],
    ['--text-warn',      'var(--status-warn)'],
    ['--text-bad',       'var(--status-bad)'],
  ];

  for (const [name, value] of tokens) {
    it(`declares ${name} = ${value}`, () => {
      const escapedName = name.replace(/[-]/g, '\\-');
      const escapedValue = value.replace(/[()]/g, '\\$&').replace(/[.]/g, '\\.');
      const pattern = new RegExp(`${escapedName}\\s*:\\s*${escapedValue}\\s*;`);
      expect(css).toMatch(pattern);
    });
  }

  it('does NOT declare type-scale overrides under [data-theme="dark"]', () => {
    const darkBlock = css.match(/\[data-theme="dark"\][^}]*\{([^}]*)\}/)?.[1] ?? '';
    expect(darkBlock).not.toMatch(/--(text|leading|weight)-/);
  });
});

// ============================================================
// PHASE 2 — Text and Heading component primitives
// ============================================================
describe('Phase 2: Text component', () => {
  let Text: any = null;
  let Heading: any = null;

  beforeAll(async () => {
    try {
      const mod = await import('./components/ui/typography/Text');
      Text = mod.Text;
    } catch { /* Phase 2 not started; tests below fail visibly */ }
    try {
      const mod = await import('./components/ui/typography/Heading');
      Heading = mod.Heading;
    } catch { /* likewise */ }
  });

  it('barrel export: Text re-exported from index', async () => {
    const idx = await import('./components/ui/typography');
    expect(idx.Text).toBeDefined();
  });

  it('barrel export: Heading re-exported from index', async () => {
    const idx = await import('./components/ui/typography');
    expect(idx.Heading).toBeDefined();
  });

  it('Text default renders <span>', () => {
    const { container } = render(React.createElement(Text, null, 'x'));
    expect(container.firstChild?.nodeName).toBe('SPAN');
  });

  it('Text as="div" renders <div>', () => {
    const { container } = render(React.createElement(Text, { as: 'div' }, 'x'));
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  // Size mapping (full table — one test per size)
  const sizes: Array<['xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl', string]> = [
    ['xs', 'var(--text-xs)'], ['sm', 'var(--text-sm)'], ['md', 'var(--text-md)'],
    ['lg', 'var(--text-lg)'], ['xl', 'var(--text-xl)'], ['2xl', 'var(--text-2xl)'],
    ['3xl', 'var(--text-3xl)'], ['4xl', 'var(--text-4xl)'],
  ];
  for (const [size, cssVar] of sizes) {
    it(`Text size="${size}" → font-size: ${cssVar}`, () => {
      const { container } = render(React.createElement(Text, { size }, 'x'));
      expect((container.firstChild as HTMLElement).style.fontSize).toBe(cssVar);
    });
  }

  // Color mapping
  const colors: Array<[string, string]> = [
    ['primary', 'var(--text-primary)'], ['secondary', 'var(--text-secondary)'],
    ['tertiary', 'var(--text-tertiary)'], ['brand', 'var(--text-brand)'],
    ['ok', 'var(--text-ok)'], ['warn', 'var(--text-warn)'], ['bad', 'var(--text-bad)'],
    ['inherit', 'inherit'],
  ];
  for (const [color, cssVar] of colors) {
    it(`Text color="${color}" → color: ${cssVar}`, () => {
      const { container } = render(React.createElement(Text, { color }, 'x'));
      expect((container.firstChild as HTMLElement).style.color).toBe(cssVar);
    });
  }

  // Family / weight / leading / modifier mapping (one each, representative)
  it('Text family="mono" → font-family: var(--font-mono)', () => {
    const { container } = render(React.createElement(Text, { family: 'mono' }, 'x'));
    expect((container.firstChild as HTMLElement).style.fontFamily).toBe('var(--font-mono)');
  });

  it('Text weight="semibold" → font-weight: var(--weight-semibold)', () => {
    const { container } = render(React.createElement(Text, { weight: 'semibold' }, 'x'));
    expect((container.firstChild as HTMLElement).style.fontWeight).toBe('var(--weight-semibold)');
  });

  it('Text leading="tight" → line-height: var(--leading-tight)', () => {
    const { container } = render(React.createElement(Text, { leading: 'tight' }, 'x'));
    expect((container.firstChild as HTMLElement).style.lineHeight).toBe('var(--leading-tight)');
  });

  it('Text tabularNums adds font-variant-numeric: tabular-nums', () => {
    const { container } = render(React.createElement(Text, { tabularNums: true }, '12'));
    expect((container.firstChild as HTMLElement).style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('Text truncate adds overflow/ellipsis/nowrap', () => {
    const { container } = render(React.createElement(Text, { truncate: true }, 'long…'));
    const el = container.firstChild as HTMLElement;
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.textOverflow).toBe('ellipsis');
    expect(el.style.whiteSpace).toBe('nowrap');
  });

  it('Text style prop overrides computed style (escape hatch)', () => {
    const { container } = render(
      React.createElement(Text, { size: 'md', style: { fontSize: '99px' } }, 'x')
    );
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });

  it('Text passes aria-label through', () => {
    const { container } = render(React.createElement(Text, { 'aria-label': 'hi' }, 'x'));
    expect(container.firstChild).toHaveAttribute('aria-label', 'hi');
  });

  // Heading spot-check
  it('Heading level=2 renders <h2> with font-size var(--text-3xl) by default', () => {
    const { container } = render(React.createElement(Heading, { level: 2 }, 't'));
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe('H2');
    expect(el.style.fontSize).toBe('var(--text-3xl)');
  });
});

// ============================================================
// PHASE 3 — Storybook
// ============================================================
describe('Phase 3: Storybook', () => {
  it('.storybook/main.ts exists', () => {
    expect(srcExists('.storybook/main.ts')).toBe(true);
  });

  it('.storybook/preview.tsx exists and imports globals.css', () => {
    expect(srcExists('.storybook/preview.tsx')).toBe(true);
    const preview = readSrc('.storybook/preview.tsx');
    expect(preview).toContain('../src/styles/globals.css');
    expect(preview).toContain('data-theme');
  });

  it('Typography.stories.tsx exports the required stories', async () => {
    const path = 'src/components/ui/typography/Typography.stories.tsx';
    expect(srcExists(path), `missing ${path}`).toBe(true);
    const mod = await import('./components/ui/typography/Typography.stories');
    const required = [
      'ScaleShowcase', 'ColorRoles', 'Weights', 'Leadings', 'Families',
      'TabularNums', 'Truncate', 'KitchenSink_DataRow',
      'KitchenSink_ColumnHeader', 'ThemeContrast',
    ];
    for (const name of required) {
      expect(mod[name as keyof typeof mod], `missing story "${name}"`).toBeDefined();
    }
  });

  it('Heading.stories.tsx exists with Levels story', async () => {
    const path = 'src/components/ui/typography/Heading.stories.tsx';
    expect(srcExists(path)).toBe(true);
    const mod = await import('./components/ui/typography/Heading.stories');
    expect(mod.Levels).toBeDefined();
  });
});

// ============================================================
// PHASE 4 — Widget migration (the compliance scorecard)
// ============================================================
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
  const files = existsSync(DASHBOARD_DIR)
    ? listTsxRecursively(DASHBOARD_DIR, { excludeTests: true })
    : [];

  it('dashboard widget directory exists', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.replace(ROOT + '/', '');
    it(`${rel} has no forbidden inline typography`, () => {
      const content = readFileSync(file, 'utf-8');
      const hits: string[] = [];
      for (const [pattern, label] of BAD_PATTERNS) {
        const match = content.match(pattern);
        if (match) hits.push(`  • ${label}: ${JSON.stringify(match[0])}`);
      }
      expect(hits, `\n${rel} has forbidden inline typography:\n${hits.join('\n')}\n`).toEqual([]);
    });
  }
});

// ============================================================
// PHASE 5 — Lint rule
// ============================================================
describe('Phase 5: ESLint rule', () => {
  it('eslint-rules/no-typography-inline.cjs exists', () => {
    expect(srcExists('eslint-rules/no-typography-inline.cjs')).toBe(true);
  });

  it('rule flags fontSize in inline style prop', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/__lint_fixture_forbidden.tsx') }
    );
    const msgs = result.messages.filter((m) => m.ruleId?.endsWith('no-typography-inline'));
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('rule allows inline style inside src/components/ui/typography/', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: ROOT });
    const [result] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/components/ui/typography/__lint_fixture_allowed.tsx') }
    );
    const msgs = result.messages.filter((m) => m.ruleId?.endsWith('no-typography-inline'));
    expect(msgs.length).toBe(0);
  });
});

// ============================================================
// PHASE 6 — Cleanup + docs
// ============================================================
describe('Phase 6: Documentation + cleanup', () => {
  it('typography README exists', () => {
    expect(srcExists('src/components/ui/typography/README.md')).toBe(true);
  });

  it('ux-polish-checklist references typography work as complete', () => {
    const checklist = readSrc('docs/ux-polish-checklist.md');
    expect(checklist.toLowerCase()).toContain('typography');
  });

  it('vanilla-extract font contract is removed (no references to vars.font)', () => {
    const walkTs = (dir: string, out: string[]) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkTs(full, out);
        else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
          const content = readFileSync(full, 'utf-8');
          if (/\bvars\.font\b/.test(content)) out.push(full.replace(ROOT + '/', ''));
        }
      }
    };
    const offenders: string[] = [];
    walkTs(resolve(ROOT, 'src'), offenders);
    expect(offenders, `vars.font still referenced in:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
```

## -1.4 Running and reading the scorecard

```bash
$ npx vitest run src/typography-compliance.test.ts --reporter=verbose

Phase 0: ADR
  ✕ ADR file exists at docs/adr/001-typography-system.md
  ✕ ADR contains required sections
  ✕ CLAUDE.md links to the ADR ...
Phase 1: Token declarations
  ✕ declares --text-xs = 0.625rem
  ✕ declares --text-sm = 0.6875rem
  ...
Phase 4: Migration
  ✕ src/components/dashboard/routing/RoutingDecisionTable.tsx has no forbidden inline typography
    • inline fontSize: "fontSize:"
    • inline fontFamily: "fontFamily:"
    ...

Test Files  1 failed (1)
Tests  14 passed | 97 failed (111)
```

Each failed test is a named, actionable target.

## -1.5 Phase -1 acceptance

- `src/typography-compliance.test.ts` exists with the content above
- It is in the vitest `exclude` list
- Running it produces a clear pass/fail count with zero "infrastructure" errors (every failure must be a refactor criterion, not e.g. "cannot resolve vitest")
- Baseline pass count recorded in the PR description (e.g. "Starting at 14/111 passing.")

**Acceptance command:**
```bash
npx vitest run src/typography-compliance.test.ts --reporter=verbose 2>&1 | grep -E "Tests\s+"
```

---

# Phase 0 — Decisions

## 0.1 Write the ADR

**File:** `docs/adr/001-typography-system.md`

**Required sections:**
- Context (the divergence found between EventStream and RoutingDecisionTable)
- Decision (CSS custom-property tokens + typed `<Text>` / `<Heading>` components; no CSS-in-JS for new work)
- Consequences (listed in a table: pro / con / mitigation for each)
- Alternatives considered (Tailwind-only, vanilla-extract everywhere, MUI/Chakra)
- Status: Accepted

**Acceptance:** file exists, reviewed by at least one other dev, linked from `omnidash-v2/CLAUDE.md`. Phase 0 tests in the compliance suite pass.

---

# Phase 1 — Token Layer

## 1.1 Add tokens to `src/styles/globals.css :root`

Insert these EXACT tokens after the existing `--font-mono` declaration (no other placement permitted):

```css
/* ===== TYPE SCALE =====
   8-step scale covering observed usage (10px ... 22px). Authored in
   rem so a future root-size override scales the whole app. */
--text-xs:   0.625rem;   /* 10px — microlabels: column headers, pills, tiny chips */
--text-sm:   0.6875rem;  /* 11px — status rows, pagination text */
--text-md:   0.75rem;    /* 12px — dense data rows (EventStream, RoutingDecisionTable) */
--text-lg:   0.8125rem;  /* 13px — form inputs, empty-state prose */
--text-xl:   0.875rem;   /* 14px — body default */
--text-2xl:  1rem;       /* 16px — emphasized inline values */
--text-3xl:  1.125rem;   /* 18px — widget titles */
--text-4xl:  1.375rem;   /* 22px — dashboard title */

/* ===== LEADING ===== */
--leading-tight:   1.2;
--leading-normal:  1.45;
--leading-loose:   1.65;

/* ===== WEIGHT ===== */
--weight-regular:   400;
--weight-medium:    500;
--weight-semibold:  600;
--weight-bold:      700;

/* ===== TEXT COLOR ROLES =====
   Semantic aliases over --ink-*. Widgets express role
   ("secondary data") rather than rung ("--ink-2"). */
--text-primary:   var(--ink);
--text-secondary: var(--ink-2);
--text-tertiary:  var(--ink-3);
--text-brand:     var(--brand);
--text-ok:        var(--status-ok);
--text-warn:      var(--status-warn);
--text-bad:       var(--status-bad);
```

## 1.2 Dark-theme overrides — EXPLICITLY EMPTY

Do NOT add dark-mode overrides for typography tokens. Sizes/weights/leadings/colors-as-roles are shared between themes. The `--ink-*` aliases automatically recolor via `[data-theme="dark"]`.

## 1.3 Acceptance

Phase 1 tests in the compliance suite pass (all 22 token declarations + the dark-mode-empty assertion).

---

# Phase 2 — Component Primitives

## 2.1 Create `src/components/ui/typography/tokens.ts`

```ts
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'ok' | 'warn' | 'bad' | 'inherit';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextLeading = 'tight' | 'normal' | 'loose';
export type TextFamily = 'sans' | 'mono';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type TextAlign = 'start' | 'center' | 'end';

export const SIZE_VAR: Record<TextSize, string> = {
  xs: 'var(--text-xs)',   sm: 'var(--text-sm)',   md: 'var(--text-md)',
  lg: 'var(--text-lg)',   xl: 'var(--text-xl)',   '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)', '4xl': 'var(--text-4xl)',
};
export const COLOR_VAR: Record<TextColor, string> = {
  primary: 'var(--text-primary)', secondary: 'var(--text-secondary)',
  tertiary: 'var(--text-tertiary)', brand: 'var(--text-brand)',
  ok: 'var(--text-ok)', warn: 'var(--text-warn)', bad: 'var(--text-bad)',
  inherit: 'inherit',
};
export const WEIGHT_VAR: Record<TextWeight, string> = {
  regular: 'var(--weight-regular)', medium: 'var(--weight-medium)',
  semibold: 'var(--weight-semibold)', bold: 'var(--weight-bold)',
};
export const LEADING_VAR: Record<TextLeading, string> = {
  tight: 'var(--leading-tight)', normal: 'var(--leading-normal)', loose: 'var(--leading-loose)',
};
export const FAMILY_VAR: Record<TextFamily, string> = {
  sans: 'var(--font-sans)', mono: 'var(--font-mono)',
};
```

## 2.2 Create `src/components/ui/typography/Text.tsx`

**Exact prop signature (no renaming, no additional props, no removed props):**

```ts
interface TextProps {
  /** Maps to --text-* scale. Default 'xl' (14px body). */
  size?: TextSize;
  /** Semantic color role. Default 'primary'. */
  color?: TextColor;
  /** Font weight. Default 'regular'. */
  weight?: TextWeight;
  /** Line-height preset. Default 'normal'. */
  leading?: TextLeading;
  /** 'sans' for UI chrome, 'mono' for data/numbers. Default 'sans'. */
  family?: TextFamily;
  /** Letter-case / decoration helpers. Default 'none'. */
  transform?: TextTransform;
  /** Text alignment. Default 'start'. */
  align?: TextAlign;
  /** Enables `font-variant-numeric: tabular-nums` — use for aligned numeric columns. */
  tabularNums?: boolean;
  /** Enables `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. */
  truncate?: boolean;
  /** Rendered element. Default 'span'. */
  as?: keyof React.JSX.IntrinsicElements;
  /** Extra class names. Merged, not replaced. */
  className?: string;
  /** Extra inline style. Merged OVER the computed token styles (escape hatch). */
  style?: React.CSSProperties;
  /** Pass-through a11y attributes. */
  id?: string;
  title?: string;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
  children: React.ReactNode;
}
```

Implementation rules:

1. Build a style object from the token maps; spread `style` prop LAST.
2. No string concatenation of class names; use `className` directly or with one `clsx` call.
3. No `useMemo` — the style object is trivial; memoizing is premature.
4. Default `as='span'`. When `as` is a block-level element, the component still renders whatever the caller asks for; no role-based re-mapping.
5. JSDoc comments on each prop mirror the API comments above.

## 2.3 Create `src/components/ui/typography/Heading.tsx`

```ts
interface HeadingProps {
  /** Semantic heading level. Renders <h1>..<h4>. */
  level: 1 | 2 | 3 | 4;
  /** Overrides the default size for the level. */
  size?: TextSize;
  color?: TextColor;
  weight?: TextWeight;         // default 'semibold'
  leading?: TextLeading;       // default 'tight'
  transform?: TextTransform;
  align?: TextAlign;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children: React.ReactNode;
}
```

Level → default size mapping (fixed, no wiggle):

- level 1 → `4xl`
- level 2 → `3xl`
- level 3 → `2xl`
- level 4 → `xl`

## 2.4 Tests

**Files:** `src/components/ui/typography/Text.test.tsx`, `Heading.test.tsx`

**Required cases (Text.test.tsx):**

1. Default props render `span` with `font-size: var(--text-xl)` and `color: var(--text-primary)`.
2. `size="md"` produces `font-size: var(--text-md)`.
3. `family="mono"` produces `font-family: var(--font-mono)`.
4. `tabularNums` produces `font-variant-numeric: tabular-nums`.
5. `truncate` produces all three CSS props.
6. `style` prop wins over computed style for overlapping keys.
7. `as="div"` renders a `div`.
8. a11y attributes pass through.

**Acceptance:** `npx vitest run src/components/ui/typography/` — 8+ passing tests for Text, mirror set for Heading.

## 2.5 Barrel

`src/components/ui/typography/index.ts`:

```ts
export { Text } from './Text';
export { Heading } from './Heading';
export type { TextProps, TextSize, TextColor, TextWeight, TextLeading, TextFamily, TextTransform, TextAlign } from './Text';
export type { HeadingProps } from './Heading';
```

No other exports. The token maps are internal.

## 2.6 Acceptance

Phase 2 tests in the compliance suite pass (all sizes, all colors, family/weight/leading/modifier mappings, escape hatch, a11y).

---

# Phase 3 — Storybook

## 3.1 Install

```bash
cd omnidash-v2
npx storybook@latest init --type react_vite --yes
npm install -D @storybook/addon-themes @storybook/addon-a11y
```

Lock the Storybook version in `package.json` to the installed major; do not use `^` for Storybook packages (fast-moving).

## 3.2 Configure

**`.storybook/main.ts` (EXACT):**

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-themes',
    '@storybook/addon-a11y',
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  typescript: { reactDocgen: 'react-docgen-typescript' },
};
export default config;
```

**`.storybook/preview.tsx` (EXACT):**

```tsx
import type { Preview } from '@storybook/react';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true }, // theme owns the background
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { Light: 'light', Dark: 'dark' },
      defaultTheme: 'Light',
      attributeName: 'data-theme',
      parentSelector: 'html',
    }),
  ],
};
export default preview;
```

## 3.3 Required stories

**`src/components/ui/typography/Typography.stories.tsx`** — must contain these stories by exact name:

1. `ScaleShowcase` — all 8 sizes, labeled with token name and px
2. `ColorRoles` — all 8 color roles (including `inherit`) as chips
3. `Weights` — all 4 weights
4. `Leadings` — all 3 leadings with multi-line paragraphs
5. `Families` — sans vs mono comparison
6. `TabularNums` — numeric column with/without toggle, side-by-side
7. `Truncate` — a narrow container demoing ellipsis
8. `KitchenSink_DataRow` — EventStream/RoutingDecisionTable row shape, built only from `<Text>`
9. `KitchenSink_ColumnHeader` — the uppercase 10px header style
10. `ThemeContrast` — grid showing every role in both themes (render two copies, one in each `data-theme`)

**`src/components/ui/typography/Heading.stories.tsx`** — levels 1-4 showcase (must include a story exported as `Levels`).

## 3.4 CI job

Add to CI workflow:

```yaml
- name: Build Storybook
  run: npx storybook build -o storybook-static
```

Storybook build failing blocks merges.

## 3.5 Acceptance

- `npm run storybook` boots
- All required stories render in the sidebar
- Theme toggle switches correctly for every story
- a11y addon reports no violations
- Phase 3 tests in the compliance suite pass

---

# Phase 4 — Widget Migration

## 4.1 Migration recipe (apply to each widget)

1. **Inventory:** run `grep -nE "fontSize|fontFamily|fontWeight|fontVariantNumeric|textTransform|letterSpacing|color:\s*'var\(--ink" <file>`. Save the line list.
2. **Map each occurrence:** for every line in the inventory, assign exactly one `<Text>` call signature. Record the mapping as a comment in your migration commit, e.g.:
   ```
   L301 fontSize:'0.75rem' → size="md"
   L306 color:'var(--ink-3)'+fontFamily:'var(--font-mono)' → color="tertiary" family="mono"
   ```
3. **Apply:** replace each occurrence with a `<Text>` wrapper. Leave the element's non-typographic props (grid position, padding, borders) on the parent; lift ONLY typographic concerns into `<Text>`.
4. **Delete dead `style` entries** (do not leave `style={{}}`).
5. **Run:** `npx tsc --noEmit && npx vitest run <widget-test>` — both must pass.
6. **Visual check:** start dev server, open widget in both themes, compare against a pre-migration screenshot at 100% zoom. Screenshots stored at `docs/migration/<widget>-before.png` and `docs/migration/<widget>-after.png`.
7. **Commit:** one commit per widget. Message format: `refactor(typography): migrate <WidgetName> to <Text> primitives`.

## 4.2 Migration order (fixed — do not reorder)

Order chosen to prove the pattern on the two visually-audited widgets first, then sweep:

1. `RoutingDecisionTable.tsx`
2. `EventStream.tsx`
3. `CostTrendPanel.tsx`
4. `CostTrend3D.tsx`
5. `CostByModelPie.tsx`
6. `QualityScorePanel.tsx`
7. `DelegationMetrics.tsx` (if any inline typographic style)
8. `BaselinesRoiCard.tsx` (likewise)
9. `ReadinessGate.tsx` (likewise)
10. `CustomRangePicker.tsx`
11. `DateRangeSelector.tsx`
12. `TimezoneSelector.tsx`
13. `AutoRefreshSelector.tsx`
14. `DashboardView.tsx` (header)
15. `ComponentWrapper.tsx` (widget title)
16. `ComponentPalette.tsx`
17. Sidebar components

## 4.3 Per-widget acceptance

After each widget's commit:

- Its file passes the Phase 4 compliance test (no forbidden patterns)
- Widget-specific unit tests pass
- Screenshot diff is visually equivalent (human judgment, in both themes)

## 4.4 Overall acceptance

Phase 4 tests in the compliance suite pass for every file under `src/components/dashboard/`.

---

# Phase 5 — Lint Enforcement

## 5.1 Custom ESLint rule

**File:** `eslint-rules/no-typography-inline.cjs`

```js
const TYPOGRAPHY_KEYS = new Set([
  'fontSize', 'fontFamily', 'fontWeight', 'fontVariantNumeric',
  'letterSpacing', 'textTransform', 'lineHeight', 'fontStyle',
]);

const ALLOWED_DIR = /src\/components\/ui\/typography\//;
const ALLOWED_FILE = /\.(test|stories)\.tsx?$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow typographic CSS in JSX style props' },
    messages: {
      banned: 'Use <Text>/<Heading> instead of inline `style.{{ key }}`. See docs/adr/001-typography-system.md.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    if (ALLOWED_DIR.test(filename) || ALLOWED_FILE.test(filename)) return {};
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        const expr = node.value && node.value.expression;
        if (!expr || expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type !== 'Property') continue;
          const keyName = prop.key.name || prop.key.value;
          if (TYPOGRAPHY_KEYS.has(keyName)) {
            context.report({ node: prop, messageId: 'banned', data: { key: keyName } });
          }
        }
      },
    };
  },
};
```

## 5.2 Wire the rule

Update `.eslintrc.cjs`:

```js
module.exports = {
  rules: {
    'local/no-typography-inline': 'error',
  },
  plugins: { local: require('./eslint-rules') },
};
```

Add script to `package.json`: `"lint": "eslint src/ --max-warnings=0"`.

## 5.3 CI

```yaml
- name: Lint
  run: npm run lint
```

Lint failing blocks merges.

## 5.4 Acceptance

- `npm run lint` passes on the migrated codebase
- Adding `<div style={{ fontSize: 10 }}>` to any dashboard widget produces a lint error in CI
- Same line inside `src/components/ui/typography/Text.tsx` passes (allowed dir)
- Phase 5 tests in the compliance suite pass

---

# Phase 6 — Documentation & Cleanup

## 6.1 Update `omnidash-v2/CLAUDE.md`

Append this section verbatim:

```markdown
## Typography

- All text in widgets must be rendered via `<Text>` or `<Heading>` from
  `@/components/ui/typography`. Do not set `fontSize`, `fontFamily`,
  `fontWeight`, `color` (for ink/text colors), `textTransform`, or
  `letterSpacing` in inline `style` props — enforced by lint.
- Tokens live in `src/styles/globals.css :root`. See
  `docs/adr/001-typography-system.md` for rationale.
- Showcase: `npm run storybook` → Typography pages.
```

## 6.2 Add `src/components/ui/typography/README.md`

Short usage reference with five copy-pasteable snippets covering: body text, data row cell, uppercase column header, truncated label, numeric column with tabular-nums.

## 6.3 Decide the vanilla-extract fate (explicit)

Add to the ADR's "Consequences" section: "vanilla-extract theme contract is retained for colors/radius on the legacy Header and AgentChatPanel components. Newly authored components MUST NOT use `vars.*`; they use CSS custom properties directly. Consolidation onto a single system is deferred."

This is DELIBERATE non-action. Record it.

## 6.4 Update `omnidash-v2/docs/ux-polish-checklist.md`

Mark typography items as complete, link to the ADR.

## 6.5 Acceptance

Phase 6 tests in the compliance suite pass.

---

# Phase 7 — Explicitly deferred

Record in the ADR, with a named re-evaluation trigger each:

| Deferred item | Re-evaluate when |
|---|---|
| JSON token source (Style Dictionary / DTCG) | ≥2 designers actively editing the token set, or tokens need to cross a non-web platform |
| Figma Tokens Studio sync | Designers begin working in Figma with shared token libraries |
| Visual regression (Chromatic / Playwright visual) | Storybook grows past 30 stories OR a typography regression ships to prod |
| Spacing scale refactor (`--space-*`) | Next time a widget's padding/margin lands inconsistently |
| Consolidation of vanilla-extract | Any new component needs colors and the legacy layer is in the way |
| Component library extraction to its own package | Second consumer appears (another app needs the same widgets) |

---

# Estimated effort

| Phase | Hours (focused) |
|---|---|
| -1. Compliance test harness | 2 |
| 0. ADR + vocabulary | 1 |
| 1. Tokens | 1 |
| 2. Components + tests | 4 |
| 3. Storybook setup + story files | 3 |
| 4. Widget migration (~17 widgets, avg 20 min each) | 6 |
| 5. Lint rule + CI | 2 |
| 6. Docs | 1 |
| **Total** | **~20 hours** |

Realistic calendar: 3 focused days, or ~1 week elapsed with interrupts.

---

# Exit criteria (the whole plan is done when)

1. `npx vitest run src/typography-compliance.test.ts` reports **0 failures**
2. `src/typography-compliance.test.ts` is removed from the vitest `exclude` list (converts to a permanent regression gate)
3. `npm run lint` passes on the full tree
4. `npm run storybook` boots and all required stories render in both themes
5. `npx tsc --noEmit` clean
6. `npx vitest run` (full suite) passes 100%
7. ADR is in `docs/adr/` and linked from CLAUDE.md
8. CI jobs for Storybook build and lint both pass
9. No open TODOs in migrated widgets referencing typography

---

## Notes for the executing developer

- **Wiggle room is deliberate in one place only:** implementation style within `<Text>` / `<Heading>` bodies (how to build the style object, whether to use `clsx` or not, minor naming). Everything else — token values, scale step size, component API shape, migration order, lint scope, exit criteria — is specified.
- **Do not reorder phases.** The compliance tests assume the order above (e.g. Phase 2 tests require Phase 1 tokens to exist, Phase 4 tests require Phase 2 components).
- **Baseline your starting state** by running the compliance test once before any code changes, and paste the "N passed | M failed" output into your PR description. This is the scoreboard; it moves in one direction.
- **Reversibility:** the migration is non-destructive. Reverting a `<Text>` change restores the previous inline style behavior. Early-phase work (tokens, components) is purely additive.

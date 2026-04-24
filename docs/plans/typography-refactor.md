# Typography System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace ad-hoc inline typography in dashboard widgets with a CSS-token + React-component system (typed `<Text>` / `<Heading>` primitives), backed by Storybook, a custom ESLint rule, and a compliance test harness.

**Architecture:** CSS custom properties in `src/styles/globals.css` as primitive tokens (size, weight, leading, text-color roles); typed React components in `src/components/ui/typography/` resolve tokens internally via inline style spread; Storybook showcases every variant across light/dark themes; a custom ESLint rule fails CI when typographic properties appear in inline `style` props outside the typography module.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Storybook 8+, ESLint (custom rule), CSS custom properties. No new runtime dependencies.

**Related ticket:** OMN-59 (Typography System Refactor epic, child of OMN-22 UX polish)

**Routing:** plan-to-tickets → omninode multi-agent workflow.

---

## Scope

### In scope

- Typography tokens (size, weight, leading, text-color roles)
- `<Text>` and `<Heading>` component primitives
- Storybook setup + required showcase stories
- Migration of all dashboard widgets
- ESLint custom rule + CI wiring
- ADR + CLAUDE.md update

### Out of scope (explicitly deferred — see Deferred Items section)

- JSON token source (Style Dictionary / DTCG)
- Figma Tokens Studio sync
- Visual regression testing (Chromatic / Playwright visual)
- Color palette overhaul
- Spacing / sizing scale refactor
- Consolidating vanilla-extract with globals.css tokens
- Extracting components to their own npm package

Each deferred item has a named re-evaluation trigger at the end of this document.

---

## Glossary (freeze before starting)

| Term | Definition |
|---|---|
| Primitive token | Raw value, e.g. `--font-mono: "IBM Plex Mono", ...` |
| Semantic token | Role alias over primitives, e.g. `--text-primary: var(--ink)` |
| Component primitive | React component wrapping token lookups, e.g. `<Text size="sm">` |

---

## Known Types Inventory

> Types discovered in the repository that are relevant to this plan.
> Verified via `grep` scan on 2026-04-24.
> Any new type introduced by a task below MUST reference this inventory
> and state why an existing type does not suffice.

### Typography-related types in the codebase today

- **None.** No `TextSize`, `TextColor`, `TextWeight`, `TextLeading`, `TextFamily`, `TextTransform`, `TextAlign`, `TextProps`, or `HeadingProps` currently exist in `src/`.
- **No existing `Text.tsx`, `Heading.tsx`, or `Typography.tsx` component files.**
- No existing `*Size` union or enum types in `src/`.

### Adjacent theme/token types (existing, will NOT be duplicated)

- `ThemeDefinition` — `src/theme/types.ts:11` — shape of imported custom theme JSON
- `RequiredToken` — `src/theme/types.ts:7` — union of required color token names
- `KnownOptionalToken` — `src/theme/types.ts:9` — already lists `'font-sans' | 'font-mono' | 'radius-sm' | 'radius-md' | 'radius-lg'`; this refactor does NOT add to it
- `ThemeColors` — `src/theme/useThemeColors.ts:3` — runtime color values for three.js; typography has no parallel

### Existing typography-utility class

- `.mono` — `src/styles/globals.css:202` — font-family + tnum/ss01 features. Continues to exist; `<Text family="mono">` is the component-level equivalent.

### Justification for new types

All new types introduced by Task 4 (`TextSize`, `TextColor`, `TextWeight`, `TextLeading`, `TextFamily`, `TextTransform`, `TextAlign`, `TextProps`, `HeadingProps`) are fresh. **Not reusing existing types because:** none exist. Scan returned zero matches for any of these names or any adjacent typography component. The theme-JSON types operate at a different layer (file-format schema for imported custom themes) and are not appropriate for component-prop modeling.

---

## Pattern Gate Result

Recorded 2026-04-24 as part of the design-to-plan Phase 2→3 gate.

- **Adversarial R1-R10 review:** Converged in 1 round. 1 CRITICAL resolved (missing Known Types Inventory — added); 1 MINOR resolved (subjective "visually equivalent" — tightened to computed-style comparison).
- **R8 Runtime State Grounding:** **N/A** — no DB tables, Kafka topics, or consumer groups. Frontend React / TS / CSS only.
- **R9 Data Flow Proof:** **N/A** — not an event pipeline. Task 1 (compliance test harness) acts as end-to-end proof of correctness.
- **R10 Rendered Output Proof:** **ACCEPTED** — per-widget dev-server screenshot + computed-style inspection in both themes (Task 16-32 step 6). Automated visual regression deferred to Phase 7 with named trigger.
- **Phase 2c Multi-model review (`hostile_reviewer`):** **SKIPPED** — tuned for Python/ONEX patterns; signal-to-noise negative on TS/CSS plan.
- **Phase 2→3 ONEX Pattern Gate (`hostile_reviewer --static`):** **SKIPPED** — its enforced anti-patterns (Docker services, `str` fields without typed models, hardcoded topic strings, uncited runtime state) are backend concerns that do not apply here.
- **HARD FORMAT REQUIREMENT:** Plan uses flat `## Task N:` structure as required by plan-to-tickets. Resolved in this version (2026-04-24 v2).

**Gate status:** PASSED.

---

## R1-R10 Review Summary

| Check | Result | Evidence |
|---|---|---|
| R1 — Count integrity | ✓ clean | 39 tasks numbered sequentially; token counts verified against declarations. |
| R2 — Acceptance criteria strength | ✓ clean | All acceptance tied to specific `npx vitest run … -t '…'` cases or grep predicates. |
| R3 — Scope violations | ✓ clean | Each task's files + steps match its stated scope; no DB-only tasks claim runtime behavior. |
| R4 — Integration traps | ✓ clean | Import paths use the confirmed `@/components/...` alias. Types are declared before use. |
| R5 — Idempotency | ✓ clean | Token additions: CSS duplicate detection. File creation: task checks existsSync. Commits are per-task. |
| R6 — Verification soundness | ✓ clean (medium+) | Component tests assert rendered inline style (strong). Compliance tests use pattern-grep (strong). |
| R7 — Type duplication | ✓ clean | Known Types Inventory above documents 0 collisions. |
| R8 — Runtime state grounding | N/A | No DB / Kafka / consumer groups. |
| R9 — Data flow proof | N/A | Not an event pipeline. Task 1 compliance suite = end-to-end proof. |
| R10 — Rendered output proof | ✓ accepted | Dev-server inspection per widget + Storybook ThemeContrast story. |

---

## Conventions used below

- **Commit format:** `<type>(<scope>): <description> [OMN-59]` per repo conventions.
- **Branch:** All tasks execute on `clone45/typography-refactor`.
- **Test runner:** `npx vitest run <target>` is the canonical invocation.
- **Compliance test:** `src/typography-compliance.test.ts` is the single source of truth for phase-completion. Every task's acceptance is tied to one or more `it(...)` cases in that file.
- **Granularity:** each Task is one logical unit of work that ends in one commit. Steps within a task are expected to take 2-5 minutes each.

---

## Task 1: Create compliance test scorecard

**Files:**
- Create: `src/typography-compliance.test.ts`
- Modify: `vitest.config.ts` (add to exclude list)

**Step 1: Create the compliance test file**

Write the full content from the block below into `src/typography-compliance.test.ts`. The file encodes every acceptance criterion of every subsequent task as a Vitest assertion. It starts ~95% RED and goes GREEN as later tasks land.

```ts
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

  beforeAll(async () => {
    try { Text = (await import('./components/ui/typography/Text')).Text; } catch {}
    try { Heading = (await import('./components/ui/typography/Heading')).Heading; } catch {}
  });

  it('barrel: Text', async () => {
    expect((await import('./components/ui/typography')).Text).toBeDefined();
  });
  it('barrel: Heading', async () => {
    expect((await import('./components/ui/typography')).Heading).toBeDefined();
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
    const path = 'src/components/ui/typography/Typography.stories.tsx';
    expect(srcExists(path)).toBe(true);
    const mod = await import('./components/ui/typography/Typography.stories');
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
    expect(srcExists('src/components/ui/typography/Heading.stories.tsx')).toBe(true);
    const mod = await import('./components/ui/typography/Heading.stories');
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
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: ROOT });
    const [r] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/__lint_fixture_forbidden.tsx') }
    );
    expect(r.messages.filter((m) => m.ruleId?.endsWith('no-typography-inline')).length).toBeGreaterThan(0);
  });
  it('rule allows inline style inside src/components/ui/typography/', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: ROOT });
    const [r] = await eslint.lintText(
      `const X = () => <div style={{ fontSize: 10 }}>x</div>;`,
      { filePath: resolve(ROOT, 'src/components/ui/typography/__lint_fixture_allowed.tsx') }
    );
    expect(r.messages.filter((m) => m.ruleId?.endsWith('no-typography-inline')).length).toBe(0);
  });
});

describe('Phase 6: Docs + cleanup', () => {
  it('typography README exists', () => {
    expect(srcExists('src/components/ui/typography/README.md')).toBe(true);
  });
  it('ux-polish-checklist references typography', () => {
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
```

**Step 2: Exclude compliance test from default run**

Edit `vitest.config.ts`, add `'src/typography-compliance.test.ts'` to the `test.exclude` array. If `exclude` does not exist, add it:

```ts
test: {
  exclude: [...configDefaults.exclude, 'src/typography-compliance.test.ts'],
  ...rest
}
```

**Step 3: Run compliance suite and capture baseline**

Run: `npx vitest run src/typography-compliance.test.ts --reporter=verbose 2>&1 | tail -3`
Expected: mostly failing. Record `Tests  N passed | M failed (TOTAL)` in commit body.

**Step 4: Confirm default suite still green**

Run: `npx vitest run`
Expected: all existing tests pass; compliance file not included.

**Step 5: Commit**

```bash
git add src/typography-compliance.test.ts vitest.config.ts
git commit -m "test(typography): compliance scorecard baseline [OMN-59]"
```

**Acceptance:** File exists, is excluded from default run, baseline score recorded. No compliance-suite cases are expected to pass yet (some may pass as trivial positives — record the exact count).

---

## Task 2: Write ADR

**Files:**
- Create: `docs/adr/001-typography-system.md`

**Step 1: Write the ADR**

Sections required (each as `## Heading`): **Context**, **Decision**, **Consequences**, **Alternatives**, **Status**.

- **Context:** Divergence found between EventStream and RoutingDecisionTable (see git log `refactor(styles): unify font-family tokens` and `feat(dashboard): UX polish batch`). Two hand-authored widgets that should visually match were off by 1px on multiple surfaces and differed on timestamp color. No typography scale / role tokens exist.
- **Decision:** CSS custom-property tokens + typed `<Text>` / `<Heading>` components. No CSS-in-JS for new work. Existing vanilla-extract usage in `Header.css.ts` / `AgentChatPanel.css.ts` retained for colors/radius; font contract already removed.
- **Consequences:** Pro/con/mitigation table covering discoverability, migration cost, lint enforcement, and future theme support.
- **Alternatives:** Tailwind-only (too big a dep for a small refactor), vanilla-extract everywhere (consolidation cost), MUI/Chakra (total replacement of chrome).
- **Status:** Accepted.

**Step 2: Run compliance Phase 0 tests**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 0: ADR'`
Expected: `ADR file exists` and `ADR contains required sections` PASS. `CLAUDE.md links to the ADR` still FAILS (fixed in Task 36).

**Step 3: Commit**

```bash
git add docs/adr/001-typography-system.md
git commit -m "docs(adr): establish typography system direction [OMN-59]"
```

**Acceptance:** ADR file present with 5 required section headings. 2 of 3 Phase 0 compliance tests pass.

---

## Task 3: Add typography tokens to globals.css

**Files:**
- Modify: `src/styles/globals.css`

**Step 1: Insert token block**

Insert the following block into the `:root { ... }` rule in `src/styles/globals.css`, directly after the existing `--font-mono` declaration. Do NOT place it elsewhere.

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

Do NOT add any override under `[data-theme="dark"]`. Typography is theme-invariant; text colors auto-follow via the `--ink-*` aliases.

**Step 2: Run compliance Phase 1 tests**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 1: Token declarations'`
Expected: all 22 token-declaration tests + the dark-mode-empty test PASS.

**Step 3: Typecheck + default suite**

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run` — all existing tests still pass.

**Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(styles): add typography type-scale + weight + leading + text-color tokens [OMN-59]"
```

**Acceptance:** All 23 Phase 1 compliance tests pass.

---

## Task 4: Create typography token maps

**Files:**
- Create: `src/components/ui/typography/tokens.ts`

**Step 1: Create the file**

```ts
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'ok' | 'warn' | 'bad' | 'inherit';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextLeading = 'tight' | 'normal' | 'loose';
export type TextFamily = 'sans' | 'mono';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type TextAlign = 'start' | 'center' | 'end';

export const SIZE_VAR: Record<TextSize, string> = {
  xs: 'var(--text-xs)', sm: 'var(--text-sm)', md: 'var(--text-md)',
  lg: 'var(--text-lg)', xl: 'var(--text-xl)', '2xl': 'var(--text-2xl)',
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

**Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add src/components/ui/typography/tokens.ts
git commit -m "feat(typography): add token type definitions and CSS var maps [OMN-59]"
```

**Acceptance:** File exists, exports 7 type aliases + 5 constant maps, typecheck clean. No Vitest cases exercise it directly; Task 6 and Task 8 tests cover it transitively.

---

## Task 5: Write Text component tests (failing)

**Files:**
- Create: `src/components/ui/typography/Text.test.tsx`

**Step 1: Write failing tests**

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders a span by default with size=xl and color=primary', () => {
    const { container } = render(<Text>hello</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe('SPAN');
    expect(el.style.fontSize).toBe('var(--text-xl)');
    expect(el.style.color).toBe('var(--text-primary)');
    expect(el.textContent).toBe('hello');
  });

  it.each([
    ['xs', 'var(--text-xs)'], ['sm', 'var(--text-sm)'], ['md', 'var(--text-md)'],
    ['lg', 'var(--text-lg)'], ['xl', 'var(--text-xl)'], ['2xl', 'var(--text-2xl)'],
    ['3xl', 'var(--text-3xl)'], ['4xl', 'var(--text-4xl)'],
  ] as const)('size=%s → font-size %s', (size, expected) => {
    const { container } = render(<Text size={size}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe(expected);
  });

  it.each([
    ['primary', 'var(--text-primary)'], ['secondary', 'var(--text-secondary)'],
    ['tertiary', 'var(--text-tertiary)'], ['brand', 'var(--text-brand)'],
    ['ok', 'var(--text-ok)'], ['warn', 'var(--text-warn)'], ['bad', 'var(--text-bad)'],
    ['inherit', 'inherit'],
  ] as const)('color=%s → %s', (color, expected) => {
    const { container } = render(<Text color={color}>x</Text>);
    expect((container.firstChild as HTMLElement).style.color).toBe(expected);
  });

  it('family=mono → font-family var(--font-mono)', () => {
    const { container } = render(<Text family="mono">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontFamily).toBe('var(--font-mono)');
  });

  it('weight=semibold → font-weight var(--weight-semibold)', () => {
    const { container } = render(<Text weight="semibold">x</Text>);
    expect((container.firstChild as HTMLElement).style.fontWeight).toBe('var(--weight-semibold)');
  });

  it('leading=tight → line-height var(--leading-tight)', () => {
    const { container } = render(<Text leading="tight">x</Text>);
    expect((container.firstChild as HTMLElement).style.lineHeight).toBe('var(--leading-tight)');
  });

  it('tabularNums → font-variant-numeric: tabular-nums', () => {
    const { container } = render(<Text tabularNums>12.34</Text>);
    expect((container.firstChild as HTMLElement).style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('truncate → overflow/ellipsis/nowrap', () => {
    const { container } = render(<Text truncate>long long long</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.overflow).toBe('hidden');
    expect(el.style.textOverflow).toBe('ellipsis');
    expect(el.style.whiteSpace).toBe('nowrap');
  });

  it('style prop overrides computed style (escape hatch)', () => {
    const { container } = render(<Text size="md" style={{ fontSize: '99px' }}>x</Text>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });

  it('as="div" renders a div', () => {
    const { container } = render(<Text as="div">x</Text>);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('passes aria-label through', () => {
    const { container } = render(<Text aria-label="hello">x</Text>);
    expect(container.firstChild).toHaveAttribute('aria-label', 'hello');
  });
});
```

**Step 2: Run and confirm they all fail**

Run: `npx vitest run src/components/ui/typography/Text.test.tsx`
Expected: file fails to load (Cannot find module `./Text`). This is the correct RED state.

**Step 3: Commit**

```bash
git add src/components/ui/typography/Text.test.tsx
git commit -m "test(typography): add Text component tests (pre-implementation) [OMN-59]"
```

**Acceptance:** Test file exists; running it produces a module-not-found failure.

---

## Task 6: Implement Text component

**Files:**
- Create: `src/components/ui/typography/Text.tsx`

**Step 1: Write the implementation**

```tsx
import React from 'react';
import {
  SIZE_VAR, COLOR_VAR, WEIGHT_VAR, LEADING_VAR, FAMILY_VAR,
  type TextSize, type TextColor, type TextWeight, type TextLeading,
  type TextFamily, type TextTransform, type TextAlign,
} from './tokens';

export interface TextProps {
  /** Maps to --text-* scale. Default 'xl' (14px body). */
  size?: TextSize;
  /** Semantic color role. Default 'primary'. */
  color?: TextColor;
  /** Font weight. Default 'regular'. */
  weight?: TextWeight;
  /** Line-height preset. Default 'normal'. */
  leading?: TextLeading;
  /** 'sans' for UI chrome, 'mono' for data. Default 'sans'. */
  family?: TextFamily;
  /** Letter-case / decoration. Default 'none'. */
  transform?: TextTransform;
  /** Text alignment. Default 'start'. */
  align?: TextAlign;
  /** Adds font-variant-numeric: tabular-nums. */
  tabularNums?: boolean;
  /** Adds overflow/ellipsis/nowrap. */
  truncate?: boolean;
  /** Rendered element. Default 'span'. */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  /** Merged OVER computed token styles (escape hatch). */
  style?: React.CSSProperties;
  id?: string;
  title?: string;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
  children: React.ReactNode;
}

export function Text({
  size = 'xl',
  color = 'primary',
  weight = 'regular',
  leading = 'normal',
  family = 'sans',
  transform = 'none',
  align = 'start',
  tabularNums = false,
  truncate = false,
  as = 'span',
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const computed: React.CSSProperties = {
    fontSize: SIZE_VAR[size],
    color: COLOR_VAR[color],
    fontWeight: WEIGHT_VAR[weight],
    lineHeight: LEADING_VAR[leading],
    fontFamily: FAMILY_VAR[family],
  };
  if (transform !== 'none') computed.textTransform = transform;
  if (align !== 'start') computed.textAlign = align;
  if (tabularNums) computed.fontVariantNumeric = 'tabular-nums';
  if (truncate) {
    computed.overflow = 'hidden';
    computed.textOverflow = 'ellipsis';
    computed.whiteSpace = 'nowrap';
  }
  // style prop wins: it's the escape hatch for one-off overrides.
  const merged = style ? { ...computed, ...style } : computed;
  return React.createElement(as, { className, style: merged, ...rest }, children);
}
```

**Step 2: Run Text tests**

Run: `npx vitest run src/components/ui/typography/Text.test.tsx`
Expected: all Text tests PASS.

**Step 3: Run compliance Phase 2 (Text portion)**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 2'`
Expected: all Text-focused compliance cases pass. Heading cases still fail (next tasks).

**Step 4: Commit**

```bash
git add src/components/ui/typography/Text.tsx
git commit -m "feat(typography): implement Text component [OMN-59]"
```

**Acceptance:** Text.test.tsx 100% pass; all Text-related compliance cases pass.

---

## Task 7: Write Heading component tests (failing)

**Files:**
- Create: `src/components/ui/typography/Heading.test.tsx`

**Step 1: Write failing tests**

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Heading } from './Heading';

describe('Heading', () => {
  it.each([
    [1, 'H1', 'var(--text-4xl)'],
    [2, 'H2', 'var(--text-3xl)'],
    [3, 'H3', 'var(--text-2xl)'],
    [4, 'H4', 'var(--text-xl)'],
  ] as const)('level=%i renders <%s> with size %s by default', (level, tag, expectedSize) => {
    const { container } = render(<Heading level={level as 1|2|3|4}>t</Heading>);
    const el = container.firstChild as HTMLElement;
    expect(el.nodeName).toBe(tag);
    expect(el.style.fontSize).toBe(expectedSize);
  });

  it('default weight=semibold and leading=tight', () => {
    const { container } = render(<Heading level={2}>t</Heading>);
    const el = container.firstChild as HTMLElement;
    expect(el.style.fontWeight).toBe('var(--weight-semibold)');
    expect(el.style.lineHeight).toBe('var(--leading-tight)');
  });

  it('size prop overrides default for level', () => {
    const { container } = render(<Heading level={1} size="xl">t</Heading>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('var(--text-xl)');
  });

  it('style prop wins over computed style', () => {
    const { container } = render(<Heading level={1} style={{ fontSize: '99px' }}>t</Heading>);
    expect((container.firstChild as HTMLElement).style.fontSize).toBe('99px');
  });
});
```

**Step 2: Confirm failing**

Run: `npx vitest run src/components/ui/typography/Heading.test.tsx`
Expected: module-not-found RED.

**Step 3: Commit**

```bash
git add src/components/ui/typography/Heading.test.tsx
git commit -m "test(typography): add Heading component tests (pre-implementation) [OMN-59]"
```

**Acceptance:** Test file exists and fails for the expected reason.

---

## Task 8: Implement Heading component

**Files:**
- Create: `src/components/ui/typography/Heading.tsx`

**Step 1: Write the implementation**

```tsx
import React from 'react';
import {
  SIZE_VAR, COLOR_VAR, WEIGHT_VAR, LEADING_VAR,
  type TextSize, type TextColor, type TextWeight, type TextLeading,
  type TextTransform, type TextAlign,
} from './tokens';

const LEVEL_DEFAULT_SIZE: Record<1 | 2 | 3 | 4, TextSize> = {
  1: '4xl', 2: '3xl', 3: '2xl', 4: 'xl',
};

export interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  size?: TextSize;
  color?: TextColor;
  weight?: TextWeight;
  leading?: TextLeading;
  transform?: TextTransform;
  align?: TextAlign;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children: React.ReactNode;
}

export function Heading({
  level,
  size,
  color = 'primary',
  weight = 'semibold',
  leading = 'tight',
  transform = 'none',
  align = 'start',
  className,
  style,
  children,
  ...rest
}: HeadingProps) {
  const effectiveSize = size ?? LEVEL_DEFAULT_SIZE[level];
  const computed: React.CSSProperties = {
    fontSize: SIZE_VAR[effectiveSize],
    color: COLOR_VAR[color],
    fontWeight: WEIGHT_VAR[weight],
    lineHeight: LEADING_VAR[leading],
  };
  if (transform !== 'none') computed.textTransform = transform;
  if (align !== 'start') computed.textAlign = align;
  const merged = style ? { ...computed, ...style } : computed;
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return React.createElement(Tag, { className, style: merged, ...rest }, children);
}
```

**Step 2: Run Heading tests**

Run: `npx vitest run src/components/ui/typography/Heading.test.tsx`
Expected: all pass.

**Step 3: Commit**

```bash
git add src/components/ui/typography/Heading.tsx
git commit -m "feat(typography): implement Heading component [OMN-59]"
```

**Acceptance:** Heading.test.tsx 100% pass.

---

## Task 9: Create typography barrel export

**Files:**
- Create: `src/components/ui/typography/index.ts`

**Step 1: Write the barrel**

```ts
export { Text } from './Text';
export type { TextProps } from './Text';
export { Heading } from './Heading';
export type { HeadingProps } from './Heading';
export type {
  TextSize, TextColor, TextWeight, TextLeading,
  TextFamily, TextTransform, TextAlign,
} from './tokens';
```

Token maps (`SIZE_VAR`, etc.) are intentionally not re-exported — they're implementation detail.

**Step 2: Run compliance Phase 2 in full**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 2'`
Expected: all 28+ Phase 2 cases PASS (barrel, Text, Heading).

**Step 3: Commit**

```bash
git add src/components/ui/typography/index.ts
git commit -m "feat(typography): add barrel export [OMN-59]"
```

**Acceptance:** Barrel exports `Text`, `Heading`, and the 7 type aliases. All Phase 2 compliance cases pass.

---

## Task 10: Install Storybook + addons

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `.storybook/` (scaffolded by `storybook init`)

**Step 1: Init Storybook**

Run: `npx storybook@latest init --type react_vite --yes`
Expected: Storybook 8.x scaffolded; `.storybook/`, `src/stories/` placeholder directory may be created (DELETE `src/stories/` if created — we don't want example stories).

**Step 2: Install extra addons**

Run: `npm install -D @storybook/addon-themes @storybook/addon-a11y`

**Step 3: Pin Storybook versions**

Open `package.json`, locate all `@storybook/*` devDependencies, replace each `^X.Y.Z` with the exact installed version (drop the caret).

**Step 4: Verify boot**

Run: `npm run storybook`
Expected: opens in browser, example/default stories render. Ctrl-C to stop.

**Step 5: Delete default example stories**

Remove `src/stories/` if present.

**Step 6: Commit**

```bash
git add package.json package-lock.json .storybook/ .gitignore
git commit -m "chore(storybook): scaffold Storybook + theme/a11y addons [OMN-59]"
```

**Acceptance:** `npm run storybook` boots; `.storybook/` directory exists; package.json has exact-pinned Storybook versions.

---

## Task 11: Configure Storybook main.ts

**Files:**
- Modify: `.storybook/main.ts`

**Step 1: Replace scaffold main.ts**

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

**Step 2: Verify boot**

Run: `npm run storybook`
Expected: boots; no default story directory scanned (only `src/**/*.stories.*`).

**Step 3: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t '.storybook/main.ts exists'`
Expected: PASS.

**Step 4: Commit**

```bash
git add .storybook/main.ts
git commit -m "chore(storybook): configure main.ts for typography story path [OMN-59]"
```

**Acceptance:** main.ts exists with the exact config above; Storybook boots.

---

## Task 12: Configure Storybook preview.tsx with theme decorator

**Files:**
- Modify: `.storybook/preview.tsx` (rename from `.ts` if needed)

**Step 1: Replace preview.tsx**

```tsx
import type { Preview } from '@storybook/react';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
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

**Step 2: Verify boot and theme toggle**

Run: `npm run storybook`
Expected: theme toggle appears in toolbar; `html[data-theme="dark"]` is set when Dark selected (inspect in devtools).

**Step 3: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t 'preview.tsx'`
Expected: PASS.

**Step 4: Commit**

```bash
git add .storybook/preview.tsx
git commit -m "chore(storybook): configure preview with theme decorator [OMN-59]"
```

**Acceptance:** preview.tsx imports globals.css, sets `data-theme` via the theme decorator; Storybook theme toggle switches correctly.

---

## Task 13: Write Typography.stories.tsx

**Files:**
- Create: `src/components/ui/typography/Typography.stories.tsx`

**Step 1: Write all 10 required stories**

Exact exported names (no synonyms): `ScaleShowcase`, `ColorRoles`, `Weights`, `Leadings`, `Families`, `TabularNums`, `Truncate`, `KitchenSink_DataRow`, `KitchenSink_ColumnHeader`, `ThemeContrast`.

Template:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Text, Heading } from './index';

const meta: Meta = { title: 'UI/Typography' };
export default meta;

export const ScaleShowcase: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] as const).map((s) => (
        <div key={s}>
          <Text size={s}>--text-{s} — The quick brown fox jumps over the lazy dog.</Text>
        </div>
      ))}
    </div>
  ),
};

export const ColorRoles: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {(['primary', 'secondary', 'tertiary', 'brand', 'ok', 'warn', 'bad', 'inherit'] as const).map((c) => (
        <Text key={c} color={c}>color="{c}" — sample text</Text>
      ))}
    </div>
  ),
};

// ... (Weights, Leadings, Families, TabularNums, Truncate,
//       KitchenSink_DataRow, KitchenSink_ColumnHeader, ThemeContrast)
// Each story demonstrates exactly one variant or pairs the token-system
// output against a realistic widget row.
```

Story-specific notes:

- **Weights:** four columns, one per weight token.
- **Leadings:** three multi-line paragraphs (three sentences each) illustrating tight/normal/loose.
- **Families:** side-by-side sans and mono at same size.
- **TabularNums:** two 5-row numeric columns, one with `tabularNums`, the other without.
- **Truncate:** narrow container (200px) holding a long string; with and without `truncate`.
- **KitchenSink_DataRow:** a 3-column row matching EventStream / RoutingDecisionTable shape, using only `<Text>`.
- **KitchenSink_ColumnHeader:** the `text-xs uppercase semibold --ink-2` column header style, built purely from `<Text>`.
- **ThemeContrast:** a grid showing every `--text-*` color role rendered twice — once inside a wrapper with `data-theme="light"` and once with `data-theme="dark"` set via an inline wrapper. Proves roles adapt to theme.

**Step 2: Verify all render**

Run: `npm run storybook`, open each story in both themes, confirm no error boundaries and no a11y-addon violations.

**Step 3: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Typography.stories'`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/ui/typography/Typography.stories.tsx
git commit -m "docs(storybook): Typography showcase (10 stories) [OMN-59]"
```

**Acceptance:** All 10 required story names exported; every story renders in both themes without error.

---

## Task 14: Write Heading.stories.tsx

**Files:**
- Create: `src/components/ui/typography/Heading.stories.tsx`

**Step 1: Write the Levels story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Heading } from './index';

const meta: Meta = { title: 'UI/Heading' };
export default meta;

export const Levels: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <Heading level={1}>Level 1 — dashboard title (22px)</Heading>
      <Heading level={2}>Level 2 — widget title (18px)</Heading>
      <Heading level={3}>Level 3 — section (16px)</Heading>
      <Heading level={4}>Level 4 — minor section (14px)</Heading>
    </div>
  ),
};
```

**Step 2: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Heading.stories'`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/ui/typography/Heading.stories.tsx
git commit -m "docs(storybook): Heading levels story [OMN-59]"
```

**Acceptance:** `Levels` story exported and renders in both themes.

---

## Task 15: Add Storybook build to CI

**Files:**
- Modify: `.github/workflows/ci.yml` (or equivalent CI workflow file)

**Step 1: Locate the CI workflow**

Run: `ls .github/workflows/`
Pick the file that runs the frontend test suite.

**Step 2: Add build step**

After the test step, add:

```yaml
      - name: Build Storybook
        run: npx storybook build -o storybook-static
```

**Step 3: Verify locally**

Run: `npx storybook build -o storybook-static`
Expected: exits with 0; `storybook-static/` directory created.

Add `storybook-static/` to `.gitignore` if not already present.

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml .gitignore
git commit -m "ci(storybook): add Storybook build job [OMN-59]"
```

**Acceptance:** Storybook builds via CLI; CI workflow contains the build step.

---

## Task 16: Migrate RoutingDecisionTable to <Text>

**Files:**
- Modify: `src/components/dashboard/routing/RoutingDecisionTable.tsx`
- Reference test: `src/components/dashboard/routing/RoutingDecisionTable.test.tsx`

**Step 1: Inventory**

Run: `grep -nE "fontSize|fontFamily|fontWeight|fontVariantNumeric|textTransform|letterSpacing|lineHeight|color:\s*'var\(--ink" src/components/dashboard/routing/RoutingDecisionTable.tsx`
Expected: ~8-10 hits.

**Step 2: Mapping (record as commit message body)**

For each hit, decide the target `<Text>` props. Example:
```
L162 fontSize:13 color:var(--ink) → <Text size="lg">...</Text> (search input label)
L174 fontSize:'0.75rem' fontFamily:'var(--font-mono)' → <table> style retains width/layout; wrap cell content in <Text size="md" family="mono">
L206 fontSize:10 textTransform:'uppercase' letterSpacing:'0.04em' color:'var(--ink-2)' fontWeight:600 → <Text size="xs" weight="semibold" transform="uppercase" color="secondary">{col.label}</Text>
L256 fontSize:13 color:'var(--ink-3)' → <Text size="lg" color="tertiary">{empty_state_msg}</Text>
L282 color:row.agreement?'var(--status-ok)':'var(--status-bad)' fontWeight:500 → <Text color={row.agreement ? 'ok' : 'bad'} weight="medium">{...}</Text>
L313 fontFamily:'var(--font-mono)' (pagination span) → <Text size="sm" family="mono">{...}</Text>
L327 fontFamily:'var(--font-mono)' (page-of span) → <Text size="sm" family="mono">{...}</Text>
```

**Step 3: Apply edits**

Replace each occurrence with a `<Text>` wrapper. Leave non-typographic props (grid layout, padding, borders) on the parent. Delete empty `style={{}}` objects.

Special case for the `<table>` element — `fontFamily` is a CSS-property that applies to ALL descendants, so keep the typography on the table only if the cells can wrap their text children in `<Text family="mono">`. The cleanest path: delete table-level `fontFamily`, wrap every cell's content in `<Text size="md" family="mono">`. Same applies to the table-level `fontSize`.

**Step 4: Run compliance for this file**

Run: `npx vitest run src/typography-compliance.test.ts -t 'RoutingDecisionTable.tsx has no forbidden'`
Expected: PASS.

**Step 5: Run widget test + typecheck**

Run: `npx tsc --noEmit && npx vitest run src/components/dashboard/routing/`
Expected: clean + 3/3 tests pass.

**Step 6: Dev-server visual verification**

Boot `npm run dev`. In the RoutingDecisionTable widget, with devtools open:
- Capture computed `font-size` and `color` on the timestamp cell, a data cell, a header cell, and the pagination status. Record in commit body.
- Verify both light and dark themes render correctly with the same values as pre-migration (the Task 1 baseline is the commit ref prior to this task).

**Step 7: Commit**

```bash
git add src/components/dashboard/routing/RoutingDecisionTable.tsx
git commit -m "refactor(typography): migrate RoutingDecisionTable to <Text> [OMN-59]"
```

**Acceptance:** File passes the Phase 4 compliance grep-test; 3 widget tests pass; pre/post computed-style values recorded in commit message body.

---

## Task 17: Migrate EventStream to <Text>

**Files:**
- Modify: `src/components/dashboard/events/EventStream.tsx`
- Reference test: `src/components/dashboard/events/EventStream.test.tsx`

**Step 1-7:** Follow the Task 16 recipe. Inventory via grep, map each occurrence, apply edits, run compliance + widget tests + typecheck, visual check in both themes, commit.

Known migration hits for this file:
- Search input: `color`, `fontSize` → UI chrome, leave as native `<input>` with `<Text>` not applicable — instead convert to `<Text as="input" size="lg">`? NO — Text shouldn't own input focus/typing. For inputs, the acceptable pattern is to keep the native `<input>` and set `fontSize` inline with a one-off exemption… BUT our compliance test forbids this. **Resolution:** set `fontSize` inline in the input but add an ESLint disable comment for that one line referencing the ADR. The README covers this exemption as "input elements retain fontSize inline by necessity; compliance test excludes inputs."

Actually no — to keep the compliance test simple, use a CSS class on inputs instead of inline styles. Define `.text-input-md` in globals.css that bundles `font-size: var(--text-lg)` and use it on the input's `className`. This keeps the inline-style ban absolute.

- Sticky column header, data rows, source pill, new-events button, status row → all become `<Text>` wrappers with appropriate size/color/family/weight.

**Commit:** `refactor(typography): migrate EventStream to <Text> [OMN-59]`

**Acceptance:** Same as Task 16.

---

## Task 18: Migrate CostTrendPanel to <Text>

**Files:**
- Modify: `src/components/dashboard/cost-trend/CostTrendPanel.tsx`

Same recipe as Task 16. Known hits: model-legend pill label spans, "Models" uppercase label, chart empty-state.

**Commit:** `refactor(typography): migrate CostTrendPanel to <Text> [OMN-59]`

**Acceptance:** Phase 4 compliance for this file passes; CostTrendPanel.test.tsx (4 tests) still passes.

---

## Task 19: Migrate CostTrend3D to <Text>

**Files:**
- Modify: `src/components/dashboard/cost-trend-3d/CostTrend3D.tsx`

Same recipe. Known hits: axis labels overlay, model-legend pill, tooltip content, "Clear focus" button, scrollbar-adjacent text elements.

**Note:** the overlay text atop the three.js canvas is HTML inside absolutely-positioned divs — standard `<Text>` migration applies.

**Commit:** `refactor(typography): migrate CostTrend3D to <Text> [OMN-59]`

**Acceptance:** Phase 4 compliance for this file passes; no visual regression in either theme.

---

## Task 20: Migrate CostByModelPie to <Text>

**Files:**
- Modify: `src/components/dashboard/cost-by-model/CostByModelPie.tsx`

Same recipe. Known hits: legend rows, tooltip content, "Models" uppercase label, total-row value.

**Commit:** `refactor(typography): migrate CostByModelPie to <Text> [OMN-59]`

**Acceptance:** Phase 4 compliance for this file passes; CostByModelPie.test.tsx (3 tests) still passes.

---

## Task 21: Migrate QualityScorePanel to <Text>

**Files:**
- Modify: `src/components/dashboard/quality/QualityScorePanel.tsx`

Same recipe. Known hits: threshold wall label, mean marker label, pass-rate headline, legend.

**Commit:** `refactor(typography): migrate QualityScorePanel to <Text> [OMN-59]`

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 22: Migrate DelegationMetrics to <Text>

**Files:**
- Modify: `src/components/dashboard/delegation/DelegationMetrics.tsx`

**Step 1 recon:** run the inventory grep. If the file has no forbidden patterns, the task is a no-op — commit with message `refactor(typography): DelegationMetrics already clean [OMN-59]` and move on.

Otherwise: same recipe.

**Acceptance:** Phase 4 compliance for this file passes (either by edits or by pre-existing cleanliness).

---

## Task 23: Migrate BaselinesRoiCard to <Text>

**Files:**
- Modify: `src/components/dashboard/baselines/BaselinesRoiCard.tsx`

Same recipe. Inventory first; migrate or no-op.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 24: Migrate ReadinessGate to <Text>

**Files:**
- Modify: `src/components/dashboard/readiness/ReadinessGate.tsx`

Same recipe.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 25: Migrate CustomRangePicker to <Text>

**Files:**
- Modify: `src/components/dashboard/CustomRangePicker.tsx`

Same recipe. Known hits: the two time-input labels + input elements (see input exemption discussion in Task 17).

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 26: Migrate DateRangeSelector to <Text>

**Files:**
- Modify: `src/components/dashboard/DateRangeSelector.tsx`

Same recipe.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 27: Migrate TimezoneSelector to <Text>

**Files:**
- Modify: `src/components/dashboard/TimezoneSelector.tsx`

Current state uses `className="mono"` + inline `fontSize: 12`. Migrate to `<Text size="md" family="mono">{tz}</Text>` and drop the className.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 28: Migrate AutoRefreshSelector to <Text>

**Files:**
- Modify: `src/components/dashboard/AutoRefreshSelector.tsx`

Same pattern as Task 27. Interval text uses `color: 'var(--status-ok)'` inline — migrate to `<Text color="ok" family="mono">{INTERVAL_LABEL}</Text>`.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 29: Migrate DashboardView header to <Text>

**Files:**
- Modify: `src/pages/DashboardView.tsx`

Known hits: title chevron styling, any inline text-styling in the header row. Dash title uses its own class (`.dash-title`) which is out of scope for this compliance test (the test scope is `src/components/dashboard/`, not `src/pages/`). Verify the compliance test scope — if it does NOT cover `src/pages/`, this task migrates purely for consistency, not gate-passing.

**Acceptance:** File has no inline typography; visual check in both themes.

---

## Task 30: Migrate ComponentWrapper to <Text>

**Files:**
- Modify: `src/components/dashboard/ComponentWrapper.tsx`

Same recipe. Known area: widget title rendering, empty-state message + hint text.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 31: Migrate ComponentPalette to <Text>

**Files:**
- Modify: `src/components/dashboard/ComponentPalette.tsx`

Same recipe.

**Acceptance:** Phase 4 compliance for this file passes.

---

## Task 32: Migrate sidebar components to <Text>

**Files:**
- Modify: any file(s) under `src/components/sidebar/` or similar directory that have inline typography (run the inventory grep to discover).

This is a catch-all for any remaining dashboard-related chrome. Run the compliance suite's Phase 4 after all targeted tasks; fix any still-failing file identified by the per-file iteration.

**Acceptance:** Every file under `src/components/dashboard/` passes the Phase 4 compliance grep-test. The full Phase 4 block runs green.

---

## Task 33: Create no-typography-inline ESLint rule

**Files:**
- Create: `eslint-rules/no-typography-inline.cjs`
- Create: `eslint-rules/index.cjs` (plugin entry)

**Step 1: Write the rule**

```js
// eslint-rules/no-typography-inline.cjs
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

**Step 2: Write the plugin entry**

```js
// eslint-rules/index.cjs
module.exports = {
  rules: {
    'no-typography-inline': require('./no-typography-inline.cjs'),
  },
};
```

**Step 3: Commit**

```bash
git add eslint-rules/
git commit -m "feat(eslint): no-typography-inline custom rule [OMN-59]"
```

**Acceptance:** Rule file loadable via `require`; returns the expected rule metadata.

---

## Task 34: Wire ESLint rule + add lint script

**Files:**
- Modify: `.eslintrc.cjs` (or equivalent ESLint config; discover with `ls -la`)
- Modify: `package.json`

**Step 1: Register plugin + rule**

In `.eslintrc.cjs`, add:

```js
module.exports = {
  // ...existing config
  plugins: [
    // ...existing
    'local',
  ],
  rules: {
    // ...existing
    'local/no-typography-inline': 'error',
  },
};
```

Register the plugin shorthand. If using flat config (`eslint.config.js`), adapt accordingly.

**Step 2: Add lint script**

In `package.json`:

```json
"scripts": {
  ...
  "lint": "eslint src/ eslint-rules/ --max-warnings=0"
}
```

**Step 3: Run lint**

Run: `npm run lint`
Expected: PASS (all widgets already migrated in Tasks 16-32).

**Step 4: Run compliance Phase 5**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 5'`
Expected: all 3 tests pass.

**Step 5: Commit**

```bash
git add .eslintrc.cjs package.json
git commit -m "feat(eslint): wire no-typography-inline rule + lint script [OMN-59]"
```

**Acceptance:** `npm run lint` passes; Phase 5 compliance passes.

---

## Task 35: Add lint job to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Add lint step**

```yaml
      - name: Lint
        run: npm run lint
```

Place before the test step.

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(eslint): add lint job [OMN-59]"
```

**Acceptance:** CI workflow contains the lint step.

---

## Task 36: Update CLAUDE.md with Typography section

**Files:**
- Modify: `omnidash-v2/CLAUDE.md`

**Step 1: Append Typography section**

After the existing sections, add:

```markdown
## Typography

- All text in widgets must be rendered via `<Text>` or `<Heading>` from
  `@/components/ui/typography`. Do not set `fontSize`, `fontFamily`,
  `fontWeight`, text `color`, `textTransform`, or `letterSpacing` in
  inline `style` props — enforced by the local ESLint rule
  `local/no-typography-inline`.
- Tokens live in `src/styles/globals.css :root`. See
  `docs/adr/001-typography-system.md` for rationale.
- Showcase: `npm run storybook` → Typography pages.
```

**Step 2: Run compliance Phase 0 and Phase 6**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 0\|Phase 6'`
Expected: all Phase 0 tests now pass (CLAUDE.md linkage); Phase 6 typography-ref test passes.

**Step 3: Commit**

```bash
git add omnidash-v2/CLAUDE.md
git commit -m "docs(claude): add Typography conventions section [OMN-59]"
```

**Acceptance:** Phase 0 compliance 100% pass; `grep typography` in CLAUDE.md returns matches.

---

## Task 37: Write typography README

**Files:**
- Create: `src/components/ui/typography/README.md`

**Step 1: Write usage guide**

Five copy-pasteable snippets, each with the rendered result described:

1. Body text: `<Text>plain text</Text>`
2. Data row cell: `<Text size="md" family="mono" color="tertiary" tabularNums>{timestamp}</Text>`
3. Uppercase column header: `<Text size="xs" weight="semibold" transform="uppercase" color="secondary">{label}</Text>`
4. Truncated label: `<Text truncate title={long}>{long}</Text>`
5. Status cell: `<Text color={ok ? 'ok' : 'bad'} weight="medium">{ok ? 'OK' : 'FAIL'}</Text>`

Include the ADR link.

**Step 2: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t 'typography README'`
Expected: PASS.

**Step 3: Commit**

```bash
git add src/components/ui/typography/README.md
git commit -m "docs(typography): README with usage examples [OMN-59]"
```

**Acceptance:** README file present; Phase 6 README test passes.

---

## Task 38: Update ux-polish-checklist

**Files:**
- Modify: `omnidash-v2/docs/ux-polish-checklist.md`

**Step 1: Mark items complete**

Add a completed bullet referencing typography work. Link the ADR.

**Step 2: Compliance**

Run: `npx vitest run src/typography-compliance.test.ts -t 'Phase 6'`
Expected: all 3 Phase 6 tests pass (README, ux-polish ref, no vars.font).

**Step 3: Commit**

```bash
git add docs/ux-polish-checklist.md
git commit -m "docs(ux-polish): mark typography refactor complete [OMN-59]"
```

**Acceptance:** Phase 6 compliance passes in full.

---

## Task 39: Proof of Life — End-to-End Verification

**Files:**
- Modify: `vitest.config.ts` (remove compliance from exclude — becomes a permanent gate)

**Step 1: Full compliance scorecard**

Run: `npx vitest run src/typography-compliance.test.ts --reporter=verbose`
Expected: 0 failures. All ~100+ compliance cases pass.

**Step 2: Full test suite (compliance still excluded)**

Run: `npx vitest run`
Expected: 100% pass.

**Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

**Step 4: Lint**

Run: `npm run lint`
Expected: 0 warnings, 0 errors.

**Step 5: Storybook build**

Run: `npx storybook build -o storybook-static`
Expected: exits 0.

**Step 6: Remove compliance exclusion**

Edit `vitest.config.ts`: remove `'src/typography-compliance.test.ts'` from the `exclude` array. The compliance file now runs as part of the default suite.

**Step 7: Full test suite (compliance included)**

Run: `npx vitest run`
Expected: 100% pass — the compliance suite is now a permanent regression gate.

**Step 8: Dev-server visual verification in both themes**

Boot `npm run dev`. Visit every migrated widget in both light and dark themes. Confirm no visual regression against the pre-migration screenshots captured during Tasks 16-32. Record the result (per-widget pass/fail).

**Step 9: Storybook verification in both themes**

Boot `npm run storybook`. Walk through every story in both themes. Confirm a11y addon reports 0 violations on every story.

**Step 10: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(typography): refactor complete — compliance is now a permanent gate [OMN-59]"
```

**Acceptance:**
- `npx vitest run` (including compliance) → 100% pass.
- `npm run lint` → 0 findings.
- `npx storybook build` → success.
- Visual parity confirmed in both themes for every migrated widget.
- Compliance test file is in the default test run (not excluded).

---

# Exit criteria (the whole plan is done when)

1. `npx vitest run src/typography-compliance.test.ts` reports **0 failures**.
2. `src/typography-compliance.test.ts` is removed from the vitest `exclude` list.
3. `npm run lint` passes on the full tree.
4. `npm run storybook` boots; all required stories render in both themes.
5. `npx tsc --noEmit` clean.
6. `npx vitest run` (full suite, including compliance) passes 100%.
7. ADR is in `docs/adr/` and linked from CLAUDE.md.
8. CI jobs for Storybook build and lint both pass.
9. No open TODOs in migrated widgets referencing typography.

---

# Deferred items (Phase 7 — explicitly not in this plan)

| Item | Re-evaluate when |
|---|---|
| JSON token source (Style Dictionary / DTCG) | ≥2 designers actively editing the token set, or tokens need to cross a non-web platform |
| Figma Tokens Studio sync | Designers begin working in Figma with shared token libraries |
| Visual regression (Chromatic / Playwright visual) | Storybook grows past 30 stories OR a typography regression ships to prod |
| Spacing scale refactor (`--space-*`) | Next time a widget's padding/margin lands inconsistently |
| Consolidation of vanilla-extract | Any new component needs colors and the legacy layer is in the way |
| Component library extraction to its own package | Second consumer appears (another app needs the same widgets) |

---

# Estimated effort

| Task range | Focus | Hours (focused) |
|---|---|---|
| 1 | Compliance scorecard | 2 |
| 2-3 | ADR + tokens | 2 |
| 4-9 | Text + Heading components | 4 |
| 10-15 | Storybook | 3 |
| 16-32 | Widget migration (17 widgets) | 6 |
| 33-35 | Lint + CI | 2 |
| 36-38 | Docs | 1 |
| 39 | Proof of Life | 1 |
| **Total** | | **~21 hours** |

Realistic calendar: 3 focused days for a single dev, or ~3-4 days elapsed with a multi-agent workflow (Tasks 16-32 parallelize cleanly).

---

# Notes for the executing developer / agent

- **Reversibility:** The migration is non-destructive. Reverting a `<Text>` change restores the previous inline style behavior. Early tasks (tokens, components) are purely additive.
- **Visual baseline:** Before starting Task 16, capture a screenshot of every migrated widget in both themes. These are the comparison baseline for Task 39 step 8.
- **Multi-agent parallelism:** Tasks 16-32 have no inter-task dependencies (each migrates a single file). They can be dispatched to parallel agents. Tasks 1-15 are sequential. Tasks 33-35 depend on 32 completing. Tasks 36-38 are independent after components exist. Task 39 depends on everything.
- **Input / textarea exemption:** HTML `<input>`, `<textarea>`, and `<select>` elements may need inline typography for native rendering reasons. When this arises, add a CSS class utility (e.g., `.text-input-md`) to globals.css rather than an inline style exemption. The lint rule does not exempt inputs.
- **Task completion commit format:** `<type>(<scope>): <description> [OMN-59]`. Commits are per-task; do not batch across tasks.

---

routing:
  strategy: plan-to-tickets
  executor: epic-team
  reason: Single-repo but many tasks (39) with Task 16-32 parallelizable — suits omninode multi-agent workflow.

# v2 UI Rebuild Traceability

This document maps every rebuilt v2 UI file back to its source in the Claude Design prototype. It exists so we can answer: "where did this HTML / CSS / interaction pattern come from?" and "has the implementation drifted from the design intent?"

## Verbatim CSS port convention (OMN-47)

As of OMN-47, all component CSS is ported verbatim from the prototype into `src/styles/*.css` files. Each file:
- Begins with `/* SOURCE: OmniDash.html:<start>-<end> — verbatim port. ... */`
- Contains rules copied character-for-character from the prototype (same properties, values, selectors, ordering)
- Uses `var(--brand*)` instead of the prototype's `var(--accent*)` everywhere, because globals.css renamed `--accent*` → `--brand*` to free the namespace for shadcn (documented deviation)

TSX for ported components uses only the prototype class names on prototype-defined elements. Tailwind utilities remain acceptable only on elements the prototype does not style.

## Tracing convention

Two levels. Both are mandatory for new or rebuilt UI files during the OMN-42 / OMN-43 / OMN-44 / OMN-45 series.

**Level 1 — inline file-header comment.** Every file that derives from the prototype gets a header comment of the form:

```tsx
// SOURCE: Claude Design prototype
//   React:   <relative path into the prototype archive>:<line range>
//   Styling: <prototype HTML path>:<line range>
// Deviations from source:
//   - <what changed and why>
```

If a file has no prototype analog (purely v2 business logic), the header says `NO PROTOTYPE SOURCE — v2-specific` with a one-line rationale.

**Level 2 — this index.** Every file with a `SOURCE:` header gets a row in the table below in the same commit as the file. Columns: v2 file, prototype React source, prototype HTML/CSS source, deviation count (see the file's header for details).

## Prototype archive

The prototype handoff bundle is hosted by Claude Design and was extracted locally to `/tmp/claude-design/experimental/` for this engagement. Key files:

- `omnidash/project/OmniDash.html` — regular theme, the chosen direction.
- `omnidash/project/src/app.jsx` — 836-line React source with all 11 components.
- `omnidash/project/src/widgets.jsx` — 8 placeholder DevOps widgets. We do not port these; v2 uses its own 7 widgets.
- `omnidash/project/src/icons.jsx` — inline SVG icon set. We replace with `lucide-react` where applicable.
- `omnidash/chats/chat1.md` — the design conversation with Claude Design, documenting intent.

## Mapping table

| v2 file | Prototype React source | Prototype HTML/CSS source | Deviations | Ticket |
|---|---|---|---|---|
| `src/styles/globals.css` | n/a | `OmniDash.html:12-67` (`:root`, `[data-theme="dark"]`, `[data-density="compact"]` blocks) + `OmniDash.html:73-93` (base resets, `.app`) | 1 (Tailwind directives and `@fontsource` imports are v2-specific additions) | OMN-42, OMN-47 |
| `src/styles/buttons.css` | n/a | `OmniDash.html:291-318` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `src/styles/sidebar.css` | n/a | `OmniDash.html:95-217` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `src/styles/topbar.css` | n/a | `OmniDash.html:219-263` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `src/styles/dashboard.css` | n/a | `OmniDash.html:265-439` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `src/styles/library.css` | n/a | `OmniDash.html:441-521` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `src/styles/modals.css` | n/a | `OmniDash.html:523-579` | 1 (`var(--accent*)` → `var(--brand*)` substitution) | OMN-47 |
| `tailwind.config.ts` | n/a | n/a (config wires tokens into Tailwind) | NO PROTOTYPE SOURCE — v2-specific | OMN-42 |
| `src/lib/utils.ts` | n/a | n/a | NO PROTOTYPE SOURCE — shadcn standard `cn()` helper | OMN-42 |
| `src/components/frame/Sidebar.tsx` | `src/app.jsx:339-422` | `OmniDash.html:93-240` | 2 (shadcn DropdownMenu replaces custom positioned menu; inline rename state local; wired to Zustand store — OMN-47: TSX ported to prototype class names; CSS at `src/styles/sidebar.css`) | OMN-43, OMN-47 |
| `src/components/frame/FrameLayout.tsx` | `src/app.jsx:208-251` | `OmniDash.html:93-95` | 1 (sidebar as direct import not prop — OMN-47: TSX ported to prototype class names; CSS at `src/styles/sidebar.css` + `src/styles/topbar.css`) | OMN-43, OMN-47 |
| `src/components/frame/Header.tsx` | `src/app.jsx:423-451` | `OmniDash.html:242-326` | 2 (theme toggle retained from OMN-38; inline new-dashboard form removed — OMN-47: TSX ported to prototype class names; CSS at `src/styles/topbar.css`) | OMN-43, OMN-47 |
| `src/pages/DashboardView.tsx` | `src/app.jsx:452-537` | `OmniDash.html:265-439` | 2 (v2 DashboardDefinition model; 2-col CSS grid, no drag-drop — OMN-47: TSX ported to prototype class names; CSS at `src/styles/dashboard.css` + `src/styles/buttons.css`) | OMN-43, OMN-47 |
| `src/store/dashboardSlice.ts` | n/a | n/a | NO PROTOTYPE SOURCE — v2 Zustand slice; actions mirror prototype app.jsx:128-163 | OMN-43 |

## Future rows

OMN-44 (Phase 3) will add rows for: `WidgetCard.tsx`, `WidgetLibrary.tsx`, `DropIndicator.tsx`, HTML5 DnD handlers.

OMN-45 (Phase 4) will add rows for: `ConfigureModal.tsx`, `ConfirmModal.tsx`. It will also mark any file whose vanilla-extract `*.css.ts` was retired.

## How to audit

- `grep -rn "SOURCE:" src/` shows every file with a recorded prototype origin.
- `grep -rn "NO PROTOTYPE SOURCE" src/` shows every v2-specific file.
- Cross-check the table below against the file list. Every rebuilt component should appear in both.

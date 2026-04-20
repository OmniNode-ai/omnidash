# v2 UI Rebuild Traceability

This document maps every rebuilt v2 UI file back to its source in the Claude Design prototype. It exists so we can answer: "where did this HTML / CSS / interaction pattern come from?" and "has the implementation drifted from the design intent?"

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
| `src/styles/globals.css` | n/a | `OmniDash.html:12-67` (`:root`, `[data-theme="dark"]`, `[data-density="compact"]` blocks) | 0 (verbatim token port; Tailwind directives and `@fontsource` imports are v2-specific additions) | OMN-42 |
| `tailwind.config.ts` | n/a | n/a (config wires tokens into Tailwind) | NO PROTOTYPE SOURCE — v2-specific | OMN-42 |
| `src/lib/utils.ts` | n/a | n/a | NO PROTOTYPE SOURCE — shadcn standard `cn()` helper | OMN-42 |

## Future rows

OMN-43 (Phase 2) will add rows for: `FrameLayout.tsx`, `Header.tsx`, `Sidebar.tsx`, `DashboardView.tsx`, `dashboardSlice.ts` additions.

OMN-44 (Phase 3) will add rows for: `WidgetCard.tsx`, `WidgetLibrary.tsx`, `DropIndicator.tsx`, HTML5 DnD handlers.

OMN-45 (Phase 4) will add rows for: `ConfigureModal.tsx`, `ConfirmModal.tsx`. It will also mark any file whose vanilla-extract `*.css.ts` was retired.

## How to audit

- `grep -rn "SOURCE:" src/` shows every file with a recorded prototype origin.
- `grep -rn "NO PROTOTYPE SOURCE" src/` shows every v2-specific file.
- Cross-check the table below against the file list. Every rebuilt component should appear in both.

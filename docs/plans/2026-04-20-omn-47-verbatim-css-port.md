---
epic_id: OMN-22
ticket_id: OMN-47
---

# Plan: UI fidelity via verbatim CSS port (OMN-47)

**Ticket:** [OMN-47](https://linear.app/voxglitch/issue/OMN-47)

## The single goal

Make the v2 chrome render pixel-identically to the Claude Design prototype by porting the prototype's CSS verbatim as named classes, and rewriting the TSX to use those class names. Nothing else.

## Non-negotiables

- Every ported CSS rule is **character-for-character identical** to the prototype's version. Same properties, same values, same selectors, same ordering within a rule, same comment style.
- Every class name the prototype uses appears in v2 TSX **character-for-character identical**.
- TSX for ported elements uses **only** the prototype class name (plus optional shadcn composition). No inlined Tailwind utility strings mixed in.
- If something can't be ported cleanly, **stop and escalate**. Do not approximate.

## Work, in order

1. Read `/tmp/claude-design/experimental/omnidash/project/OmniDash.html` lines 12-740 completely.
2. Carve the CSS into files under `src/styles/`: `sidebar.css`, `topbar.css`, `dashboard.css`, `buttons.css`, `library.css`, `modals.css` (empty stubs for OMN-44/45 are fine for library/modals; the other four ship content now).
3. Each file starts with `/* SOURCE: OmniDash.html:<start>-<end> — verbatim port. */`.
4. Import them from `src/styles/globals.css` under `@layer components`.
5. Rewrite the TSX for Sidebar, FrameLayout, Header, DashboardView, and the widget chrome (ComponentCell or its successor) to use the prototype's class names exclusively.
6. Resolve the three carried-over systemic fixes (undefined status tokens, `useThemeColors` oklch parser, `themes.css.ts` body fontFamily override).

## Out of scope

- Drag-and-drop (OMN-44).
- Modal replacement + vanilla-extract removal (OMN-45).
- Widget internal behavior.

## DoD

Per the OMN-47 ticket's checklist.

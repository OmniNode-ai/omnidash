---
epic_id: OMN-22
ticket_id: OMN-42
---

# Plan: UI rebuild phase 1 (stack + tokens + traceability)

**Ticket:** [OMN-42](https://linear.app/voxglitch/issue/OMN-42)

## What ships in this PR

No user-visible changes. Foundation only.

1. Install Tailwind CSS v3 + PostCSS + autoprefixer + `tailwindcss-animate`.
2. Install shadcn utilities (`class-variance-authority`, `clsx`, `tailwind-merge`) and `lucide-react`.
3. Install `wouter` (router) and `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`.
4. Hand-write shadcn's config files (components.json, cn() helper, tailwind.config.ts update). Skip `npx shadcn init` because it is interactive.
5. Create `src/styles/globals.css` with Tailwind directives + OKLCH tokens ported verbatim from `OmniDash.html:12-67` of the Claude Design prototype.
6. Import globals + IBM Plex font-face from `main.tsx`.
7. Create `docs/ui-rebuild-traceability.md` with the header explaining the tracing convention and an empty mapping table.

## Tailwind version choice

Tailwind v3 (not v4). v4's config-in-CSS style is newer; v3's stable ecosystem and shadcn tooling path is better-trodden. Easier to debug if something breaks.

## Non-goals for this phase

- Rebuilding any component.
- Removing any vanilla-extract file.
- Touching `main.tsx` beyond the new imports.
- Touching `vite.config.ts` (the vanilla-extract plugin stays).

## Risk

Coexistence of Tailwind and vanilla-extract. Both will emit CSS in the same page. Mitigated because (a) vanilla-extract's class names are unique hashes, (b) Tailwind utilities only appear in files that import them, (c) the OKLCH tokens live in their own stylesheet.

## Definition of Done

- [ ] `npm install` and `npm run dev` both succeed cleanly.
- [ ] `npm run check` passes.
- [ ] `npm test` passes.
- [ ] `docs/ui-rebuild-traceability.md` exists with header and empty table.
- [ ] Body text renders in IBM Plex Sans when a Tailwind class is applied somewhere for verification.
- [ ] No visible change to any existing page or component.

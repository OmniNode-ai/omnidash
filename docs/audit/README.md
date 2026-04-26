# v2 UI Fidelity Audit — chunked workflow

This directory holds the chunk-based audit system for bringing the v2 UI to
pixel fidelity with the Claude Design prototype. Each chunk is one markdown
file covering ≤10 JSX lines (plus the matching CSS). Agents audit one chunk
at a time; the orchestrator groups findings and applies fixes coherently.

## Why chunked?

Past attempts to audit the whole UI at once missed whole-element omissions
(missing widget headers, missing search inputs, missing empty-state
structure). Chunks of ≤10 JSX lines force element-by-element review and
eliminate "I skipped that" as a failure mode.

## Folder states

```
todo/          ← not yet audited
in-progress/   ← agent currently auditing (one file at a time)
audited/       ← findings written, waiting for fix grouping by orchestrator
done/          ← fixes applied
blocked/       ← ambiguous or dependent on external decision
```

State transitions are file moves via `git mv`. The folder a file lives in
is the source of truth for its state.

## Agent workflow (strict)

For each chunk, the agent:

1. Picks the lowest-numbered file in `todo/` for the active component.
2. `git mv todo/<id>.md in-progress/<id>.md`.
3. Commits with message `audit: claim <id> [OMN-48]`.
4. Reads the chunk file completely (prototype JSX + CSS are quoted inline).
5. Opens each file listed in `v2_targets` and locates the corresponding
   implementation.
6. Walks the audit checklist:
   - **Design** — do the CSS properties and values match the prototype exactly?
   - **Structure** — does every element exist, in the same nesting order, with
     the same class names?
   - **Content** — does every static string, SVG path, viewBox, placeholder,
     and data attribute match?
7. For each issue found, writes a structured `**Issue**:` block in the
   Findings section. Uses severities: CRITICAL / MAJOR / MINOR / NIT.
8. If no issues on an axis, writes `- No issues found.` under that axis.
9. Updates `status: audited` in frontmatter.
10. `git mv in-progress/<id>.md audited/<id>.md`.
11. Single commit for the findings write + file move:
    `audit: complete <id> [OMN-48]`.
12. **Agent NEVER applies code fixes.** Only writes findings. Fixes are
    orchestrator's job.

## If the agent can't complete

- Ambiguous prototype, missing context, dependency on another chunk:
  `git mv in-progress/<id>.md blocked/<id>.md` with a `blocked_reason:` line
  in frontmatter. Single commit: `audit: block <id>: <short reason> [OMN-48]`.

## Orchestrator workflow (after a batch is audited)

1. Enumerate files in `audited/`.
2. Parse Findings blocks. Group by theme: "all chunks touching `.btn`",
   "all chunks with incorrect `--line` color", etc.
3. Apply fixes in logical groups (one PR per group, or one commit per group).
4. Move resolved chunk files to `done/` in the fix commit. Fill in the
   Resolution section of each chunk with a one-line pointer to the fix
   commit(s).

## File naming

`<component-slug>-<NN>-<short-desc>.md`

Examples:
- `sidebar-01-root-and-brand-svg.md`
- `sidebar-02-brand-name-block.md`
- `dashboard-view-03-meta-row.md`

## Frontmatter schema

```yaml
---
id: <component>-<NN>
component: <ComponentName>
prototype_jsx:
  file: src/app.jsx
  lines: "<start>-<end>"
prototype_css:
  file: OmniDash.html
  lines: "<start>-<end>"
v2_targets:
  - <path>
status: todo                        # todo | in-progress | audited | done | blocked
dependencies: []                    # chunk ids that must complete first
blocked_reason: null                # populated only when status == blocked
---
```

## Progress commands

```bash
# Snapshot
echo "todo:        $(ls docs/audit/todo/*.md 2>/dev/null | wc -l)"
echo "in-progress: $(ls docs/audit/in-progress/*.md 2>/dev/null | wc -l)"
echo "audited:     $(ls docs/audit/audited/*.md 2>/dev/null | wc -l)"
echo "done:        $(ls docs/audit/done/*.md 2>/dev/null | wc -l)"
echo "blocked:     $(ls docs/audit/blocked/*.md 2>/dev/null | wc -l)"
```

## Model and concurrency policy

- **Model**: Opus-xhigh per chunk. Cost is real but the audit miss rate with
  Sonnet on prior rounds made the tradeoff clear.
- **Concurrency**: one agent at a time. Prevents claim races and keeps
  git history linear for review.
- **Fix concurrency**: orchestrator applies fixes in small groups; each fix
  group is one commit.

## Ticket

All chunk work lives under ticket **OMN-48** "Chunked UI fidelity audit and
fix pipeline."

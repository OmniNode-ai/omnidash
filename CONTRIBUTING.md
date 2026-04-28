# Contributing to OmniDash v2

Thanks for your interest in contributing. This guide covers the workflow for landing a change.

## Getting Started

```bash
git clone https://github.com/OmniNode-ai/omnidash-v2.git
cd omnidash-v2
npm install
pre-commit install   # one time, after the first clone
npm run dev
```

`pre-commit install` wires the local hooks. They run automatically on every `git commit`. Never bypass them with `--no-verify`. If a hook fails, fix the underlying issue or open a discussion before pushing.

## Branch Naming

Use the form `<author>/<short-description>`. Examples:

- `alice/cost-trend-tooltip-fix`
- `bob/add-quality-scorecard-widget`
- `carol/storybook-coverage-bump`

Keep the description short, lowercase, hyphen-separated. One topic per branch.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|---|---|
| `feat:` | New user-visible capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Internal restructuring with no behavior change |
| `test:` | Adding or fixing tests |
| `chore:` | Build, tooling, deps, housekeeping |
| `perf:` | Performance improvement |

Example:

```
feat(cost-trend): add hourly granularity toggle to 2D variant
```

Squash unrelated commits before opening a PR. The git log on `main` should read as a sequence of well-scoped changes.

## Local Verification Before a PR

Run all four checks. They must pass locally before you push:

```bash
npm run lint        # ESLint, zero warnings allowed
npm run check       # TypeScript (tsc --noEmit)
npm run test        # Vitest unit tests + Storybook coverage compliance
npm run build       # Type-check + production Vite build
```

If you added a widget, also run `npm run generate:registry` and commit the regenerated `src/registry/component-registry.json`.

## Pull Request Process

1. Push your branch and open a PR against `main`.
2. CI runs lint, type-check, tests, and a production build. All must be green.
3. CodeRabbit auto-reviews the diff and posts comments. Address every comment — either fix the code or reply with reasoning before resolving the thread. Unresolved CodeRabbit threads block merge.
4. Once CI is green and CodeRabbit threads are resolved, request review from a human maintainer.
5. PRs are merged using squash-merge. The PR title becomes the squash commit subject — keep it conventional-commit-formatted.

## What Belongs in a PR

- One topic per PR. Splitting a sprawling change into reviewable chunks is the contributor's responsibility, not the reviewer's.
- Tests for new behavior. Widgets need both `Empty` and `Populated` Storybook stories; the compliance scorecard enforces this on every `npm test`.
- Updated documentation when you change a public-facing convention.
- Generated artifacts (registry JSON, generated types) committed alongside the source change that produced them.

## What Does Not Belong in a PR

- Hardcoded URLs, hostnames, or absolute paths. Use environment variables or relative resolution.
- Hand-edits to generated files (`src/registry/component-registry.json`, anything under `src/shared/types/generated/`). Regenerate instead.
- Changes to files under `node_modules/`.
- Inline typography styling (`fontSize`, `fontFamily`, `fontWeight`, text `color`, `textTransform`, `letterSpacing`). Use the `<Text>` and `<Heading>` primitives from `@/components/ui/typography`. The local ESLint rule `local/no-typography-inline` enforces this.

## Code of Conduct

This project adopts the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) v2.1. By participating, you agree to abide by its terms. A project-specific `CODE_OF_CONDUCT.md` will be added in a follow-up; until then the linked Covenant is authoritative.

## Reporting Issues

File issues at https://github.com/OmniNode-ai/omnidash-v2/issues. Include:

- What you expected to happen.
- What actually happened.
- Reproduction steps or a minimal failing test.
- Browser, OS, and Node version.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

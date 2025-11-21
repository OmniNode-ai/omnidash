# Snapshot Testing - Quick Start Guide

Quick reference for running visual regression tests with Playwright.

## Setup (One-Time)

```bash
# Install Playwright browsers
npx playwright install
```

## Running Tests

```bash
# Run all snapshot tests
npm run test:snapshots

# Run with interactive UI
npm run test:snapshots:ui

# View test report
npm run test:snapshots:report
```

## After Making UI Changes

```bash
# Update snapshots (after intentional changes)
npm run test:snapshots:update

# Or update specific test
npm run test:snapshots:update -- agent-operations.snapshot.spec.ts
```

## Common Workflows

### Adding New Snapshot Test

1. Create test file in `client/src/tests/snapshots/`
2. Write test using Playwright API
3. Generate baseline: `npm run test:snapshots:update -- your-test.spec.ts`
4. Commit snapshots to Git

### Reviewing Failed Tests

1. Run: `npm run test:snapshots`
2. If fails: `npm run test:snapshots:report`
3. Review diff images in HTML report
4. If intentional: `npm run test:snapshots:update`
5. If bug: Fix code and re-run

## Test Structure

```
client/src/tests/snapshots/
├── agent-operations.snapshot.spec.ts       # Agent Operations dashboard
├── pattern-learning.snapshot.spec.ts       # Pattern Learning dashboard
├── intelligence-operations.snapshot.spec.ts # Intelligence Operations dashboard
├── event-flow.snapshot.spec.ts             # Event Flow dashboard
├── platform-health.snapshot.spec.ts        # Platform Health dashboard
└── components.snapshot.spec.ts             # UI components
```

## Configuration

All configuration in `playwright.config.ts`:

- Base URL: `http://localhost:3000`
- Viewports: Desktop (1920×1080), Laptop (1366×768), Tablet (iPad), Mobile (iPhone 12)
- Max diff threshold: 1%

## Troubleshooting

**"Connection refused" error**
→ Start dev server: `npm run dev`

**Flaky tests**
→ Check `docs/testing/SNAPSHOT_TESTING.md` for solutions

**Different snapshots locally vs CI**
→ Ensure same Playwright version and browser

## Resources

- Full guide: `docs/testing/SNAPSHOT_TESTING.md`
- Playwright docs: https://playwright.dev
- Config file: `playwright.config.ts`

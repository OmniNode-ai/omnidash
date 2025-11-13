# Snapshot Testing with Playwright

This guide covers visual regression testing using Playwright for the Omnidash application.

## Overview

Snapshot tests (also called visual regression tests) capture screenshots of UI components and compare them against baseline images to detect unintended visual changes. This ensures that UI modifications are intentional and don't introduce unexpected regressions.

## Why Snapshot Testing?

- **Visual Regression Detection**: Catch unintended CSS changes, layout shifts, and visual bugs
- **Cross-Browser Consistency**: Test across Chrome, Firefox, Safari, and Edge
- **Responsive Design Validation**: Verify layouts across desktop, tablet, and mobile viewports
- **Theme Testing**: Validate dark/light mode consistency
- **Component Isolation**: Test individual components in isolation
- **Documentation**: Snapshots serve as visual documentation of the UI

## Setup

### Prerequisites

- Node.js 18+ installed
- Project dependencies installed (`npm install`)
- Development server running on port 3000

### Installation

Playwright and @playwright/test are already installed as dev dependencies. To install browser binaries:

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers for testing.

## Running Tests

### Basic Commands

```bash
# Run all snapshot tests
npm run test:snapshots

# Update all snapshots (after intentional UI changes)
npm run test:snapshots:update

# Run tests with UI mode (interactive)
npm run test:snapshots:ui

# Debug tests (step through with browser)
npm run test:snapshots:debug

# View HTML report after test run
npm run test:snapshots:report
```

### Running Specific Tests

```bash
# Run tests for a specific dashboard
npx playwright test agent-operations.snapshot.spec.ts

# Run tests matching a pattern
npx playwright test --grep "Agent Operations"

# Run only failing tests
npx playwright test --only-changed
```

### Running on Specific Viewports

```bash
# Run only desktop tests
npx playwright test --project=chromium-desktop

# Run only mobile tests
npx playwright test --project=chromium-mobile

# Run only tablet tests
npx playwright test --project=chromium-tablet
```

## Configuration

Configuration is defined in `playwright.config.ts` at the project root.

### Key Settings

- **Test Directory**: `client/src/tests/snapshots/`
- **Base URL**: `http://localhost:3000` (configurable)
- **Timeout**: 30 seconds per test
- **Screenshot Comparison**:
  - Max diff pixel ratio: 0.01 (1%)
  - Threshold: 0.2 (pixel difference threshold)
  - Max diff pixels: 100

### Viewport Configurations

| Project | Device | Viewport Size | Use Case |
|---------|--------|---------------|----------|
| chromium-desktop | Desktop Chrome | 1920×1080 | Standard desktop |
| chromium-laptop | Desktop Chrome | 1366×768 | Laptop screens |
| chromium-tablet | iPad Pro | 1024×1366 | Tablet portrait |
| chromium-mobile | iPhone 12 | 390×844 | Mobile phones |

## Test Structure

### Dashboard Tests

Located in `client/src/tests/snapshots/`:

- `agent-operations.snapshot.spec.ts` - Agent Operations dashboard
- `pattern-learning.snapshot.spec.ts` - Pattern Learning dashboard
- `intelligence-operations.snapshot.spec.ts` - Intelligence Operations dashboard
- `event-flow.snapshot.spec.ts` - Event Flow dashboard
- `platform-health.snapshot.spec.ts` - Platform Health dashboard
- `components.snapshot.spec.ts` - Individual UI components

### Test Anatomy

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page
    await page.goto('/route');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Wait for animations to complete
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('dashboard-name.png', {
      fullPage: true,
    });
  });

  test('should match specific section', async ({ page }) => {
    const section = page.locator('.section-class');
    await expect(section).toHaveScreenshot('section-name.png');
  });
});
```

## Writing New Tests

### 1. Create Test File

Create a new file in `client/src/tests/snapshots/` with the naming convention:

```
<feature-name>.snapshot.spec.ts
```

### 2. Basic Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Your Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/your-route');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('should match full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('your-feature.png', {
      fullPage: true,
    });
  });
});
```

### 3. Generate Baseline Snapshots

Run the test with update flag to generate initial snapshots:

```bash
npm run test:snapshots:update -- your-feature.snapshot.spec.ts
```

### 4. Best Practices

**Wait for Dynamic Content**:
```typescript
// Wait for specific elements
await page.waitForSelector('[data-testid="metric-card"]');

// Wait for network to be idle
await page.waitForLoadState('networkidle');

// Wait for animations
await page.waitForTimeout(500);
```

**Handle Loading States**:
```typescript
// Hide loading spinners for consistent snapshots
await page.evaluate(() => {
  document.querySelectorAll('.loading-spinner').forEach(el => {
    el.style.display = 'none';
  });
});
```

**Test Both Themes**:
```typescript
test('should match dark theme', async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('feature-dark.png');
});

test('should match light theme', async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('feature-light.png');
});
```

**Component-Level Testing**:
```typescript
test('should match metric card', async ({ page }) => {
  const card = page.locator('[data-testid="metric-card"]').first();
  await expect(card).toHaveScreenshot('metric-card.png');
});
```

## Snapshot Storage

Snapshots are stored in directories named after the test file:

```
client/src/tests/snapshots/
├── agent-operations.snapshot.spec.ts
├── agent-operations.snapshot.spec.ts-snapshots/
│   ├── chromium-desktop/
│   │   ├── agent-operations-desktop.png
│   │   ├── agent-operations-header.png
│   │   └── ...
│   ├── chromium-laptop/
│   ├── chromium-tablet/
│   └── chromium-mobile/
├── pattern-learning.snapshot.spec.ts
└── pattern-learning.snapshot.spec.ts-snapshots/
    └── ...
```

**Note**: Snapshot directories are tracked in Git to maintain baselines across the team.

## Handling Test Failures

### 1. Review Differences

When a test fails, Playwright generates:
- **Actual**: Current screenshot
- **Expected**: Baseline snapshot
- **Diff**: Visual diff highlighting changes

View the HTML report to see differences:

```bash
npm run test:snapshots:report
```

### 2. Intentional Changes

If the UI change was intentional, update the baseline:

```bash
# Update all snapshots
npm run test:snapshots:update

# Update specific test
npm run test:snapshots:update -- agent-operations.snapshot.spec.ts
```

### 3. Unintentional Changes

If the change was NOT intentional:
1. Review the diff to identify the issue
2. Fix the CSS/component code
3. Re-run tests to verify the fix

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Snapshot Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run snapshot tests
        run: npm run test:snapshots

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

### CI Configuration Notes

- Playwright config uses `workers: 1` in CI for stable screenshots
- Retry count is 2 in CI to handle flaky tests
- Only Chromium browser is used in CI for speed
- HTML report is uploaded as an artifact

## Troubleshooting

### Tests Flaky or Inconsistent

**Problem**: Snapshots differ on each run

**Solutions**:
1. Increase wait times for dynamic content
2. Hide loading indicators/animations
3. Mock time-dependent content (dates, timestamps)
4. Use `waitForLoadState('networkidle')`

```typescript
// Mock current time
await page.addInitScript(() => {
  Date.now = () => 1609459200000; // Fixed timestamp
});
```

### Server Not Starting

**Problem**: Test fails with "net::ERR_CONNECTION_REFUSED"

**Solutions**:
1. Ensure dev server is running: `npm run dev`
2. Check port 3000 is not blocked by firewall
3. Verify `webServer` config in `playwright.config.ts`

### Snapshots Too Large

**Problem**: Snapshot files are very large (>1MB)

**Solutions**:
1. Test specific sections instead of full page
2. Use lower resolution viewports for some tests
3. Compress images (Playwright auto-compresses PNG)

### Different Results Locally vs CI

**Problem**: Tests pass locally but fail in CI

**Solutions**:
1. Ensure same Playwright version
2. Use consistent browser (Chromium only in CI)
3. Check font rendering differences
4. Verify timezone/locale settings

```typescript
// Set consistent locale
use: {
  locale: 'en-US',
  timezoneId: 'America/New_York',
}
```

## Advanced Features

### Custom Screenshot Options

```typescript
await expect(page).toHaveScreenshot('custom.png', {
  // Full page scrolling screenshot
  fullPage: true,

  // Clip to specific area
  clip: { x: 0, y: 0, width: 800, height: 600 },

  // Custom comparison thresholds
  maxDiffPixelRatio: 0.05,
  threshold: 0.3,

  // Mask dynamic elements
  mask: [page.locator('.timestamp')],

  // Hide elements
  omitBackground: true,
});
```

### Masking Dynamic Content

```typescript
test('should mask dynamic timestamps', async ({ page }) => {
  await expect(page).toHaveScreenshot('masked.png', {
    mask: [
      page.locator('.timestamp'),
      page.locator('.user-avatar'),
    ],
  });
});
```

### Multiple Snapshots in One Test

```typescript
test('should capture user flow', async ({ page }) => {
  // Initial state
  await expect(page).toHaveScreenshot('step-1-initial.png');

  // After interaction
  await page.click('button[data-action="expand"]');
  await expect(page).toHaveScreenshot('step-2-expanded.png');

  // After another interaction
  await page.fill('input[name="filter"]', 'test');
  await expect(page).toHaveScreenshot('step-3-filtered.png');
});
```

## Performance Tips

1. **Run Tests in Parallel**: Use multiple workers for faster execution
2. **Use Specific Selectors**: `[data-testid]` is faster than CSS classes
3. **Skip Unnecessary Viewports**: Test only relevant screen sizes
4. **Reuse Browser Instances**: Playwright shares contexts when possible
5. **Selective Testing**: Use `--grep` to run only changed features

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Visual Testing Guide](https://playwright.dev/docs/test-snapshots)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)

## FAQ

**Q: How often should I update snapshots?**
A: Update snapshots whenever you intentionally change the UI. Review diffs carefully before updating.

**Q: Should snapshots be committed to Git?**
A: Yes! Snapshots should be committed so the entire team uses the same baselines.

**Q: What's the difference between Vitest and Playwright tests?**
A: Vitest tests unit/component logic. Playwright tests visual appearance and integration.

**Q: Can I test animations?**
A: Yes, but wait for animations to complete or test specific animation frames.

**Q: How do I test authenticated pages?**
A: Use Playwright's authentication context or mock authentication state.

---

**Last Updated**: 2025-11-11
**Maintainer**: Omnidash Team

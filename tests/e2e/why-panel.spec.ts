/**
 * E2E Tests — Why This Happened Panel (OMN-2469)
 *
 * Covers all four views of the "Why This Happened" panel with live
 * DecisionRecord data (mock data mode).
 *
 * Views tested:
 *   1. Intent vs Resolved Plan (OMN-2468)
 *   2. Decision Timeline (OMN-2469)
 *   3. Candidate Comparison (OMN-2470)
 *   4. Agent Narrative Overlay (OMN-2471)
 *
 * Prerequisites:
 *   - App server running on http://localhost:3000
 *   - /why route registered and serving WhyThisHappened page
 *
 * Run with:
 *   npx playwright test tests/e2e/why-panel.spec.ts --project=chromium-desktop
 *
 * @see OMN-2469 (part 1-of-2)
 */

import { test, expect } from '@playwright/test';

const WHY_URL = '/why';

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Navigate to the Why This Happened page and wait for it to load.
 */
async function gotoWhyPanel(page: import('@playwright/test').Page) {
  await page.goto(WHY_URL);
  await page.waitForSelector('[data-testid="why-this-happened-page"]', { timeout: 10_000 });
}

/**
 * Click a tab by its test ID and wait for the content to become visible.
 */
async function _clickTab(
  page: import('@playwright/test').Page,
  tabTestId: string,
  contentTestId: string
) {
  await page.click(`[data-testid="${tabTestId}"]`);
  await page.waitForSelector(`[data-testid="${contentTestId}"]`, { timeout: 5_000 });
}

// ============================================================================
// Test suite: Why This Happened panel loads
// ============================================================================

test.describe('Why This Happened panel — all four views', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWhyPanel(page);
  });

  // --------------------------------------------------------------------------
  // Page-level smoke
  // --------------------------------------------------------------------------

  test('page renders with the correct title', async ({ page }) => {
    await expect(page.getByText('Why This Happened')).toBeVisible();
    await expect(page.locator('[data-testid="why-this-happened-page"]')).toBeVisible();
  });

  test('four-tab navigation is visible', async ({ page }) => {
    await expect(page.locator('[data-testid="why-panel-tabs"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-intent"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-comparison"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-narrative"]')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // View 1: Intent vs Resolved Plan (OMN-2468)
  // --------------------------------------------------------------------------

  test.describe('View 1: Intent vs Resolved Plan', () => {
    test('Intent vs Plan panel loads by default', async ({ page }) => {
      // Intent vs Plan is the default active tab
      await expect(page.locator('[data-testid="intent-vs-plan-panel"]')).toBeVisible();
    });

    test('shows both column headers', async ({ page }) => {
      await expect(page.getByText('Your Intent')).toBeVisible();
      await expect(page.getByText('Resolved Plan')).toBeVisible();
    });

    test('shows at least one field row with mock data', async ({ page }) => {
      const rows = page.locator('[data-testid="intent-vs-plan-fields"] [role="row"]');
      await expect(rows.first()).toBeVisible();
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
    });

    test('shows inferred count badge when inferred fields exist', async ({ page }) => {
      await expect(page.locator('[data-testid="inferred-count-badge"]')).toBeVisible();
    });

    test('inferred value badge is clickable and triggers navigation to Comparison tab', async ({
      page,
    }) => {
      // Click the Model inferred badge (links to dr-001)
      const modelBadge = page.locator('[data-testid="origin-badge-model"]');
      await expect(modelBadge).toBeVisible();
      await modelBadge.click();

      // Should switch to Candidate Comparison tab
      await expect(page.locator('[data-testid="candidate-comparison-panel"]')).toBeVisible();
    });

    test('user-specified fields show checkmark', async ({ page }) => {
      const contextRow = page.locator('[data-testid="field-row-context"]');
      await expect(contextRow).toBeVisible();
      await expect(contextRow.getByText('✓')).toBeVisible();
    });
  });

  // --------------------------------------------------------------------------
  // View 2: Decision Timeline (OMN-2469)
  // --------------------------------------------------------------------------

  test.describe('View 2: Decision Timeline', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('[data-testid="tab-timeline"]');
      await page.waitForSelector('[data-testid="decision-timeline-panel"]');
    });

    test('Decision Timeline panel loads with rows', async ({ page }) => {
      await expect(page.locator('[data-testid="decision-timeline-panel"]')).toBeVisible();
      const rows = page.locator('[data-testid="decision-timeline-rows"] [role="listitem"]');
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
    });

    test('timeline rows show decision type badges', async ({ page }) => {
      // At least one model_select or other type badge should be visible
      const typeBadges = page.locator('[data-testid^="timeline-type-"]');
      const count = await typeBadges.count();
      expect(count).toBeGreaterThan(0);
    });

    test('expanding a row reveals Layer 1 detail', async ({ page }) => {
      // Find the first timeline row toggle and click it
      const firstToggle = page.locator('[data-testid^="timeline-row-toggle-"]').first();
      await firstToggle.click();

      // Layer 1 detail should appear
      await expect(page.locator('[data-testid="layer1-detail"]')).toBeVisible();
    });

    test('Layer 2 is hidden until "Show agent narrative" is clicked', async ({ page }) => {
      const firstToggle = page.locator('[data-testid^="timeline-row-toggle-"]').first();
      await firstToggle.click();

      // Layer 2 should NOT be visible yet
      await expect(page.locator('[data-testid="layer2-detail"]')).not.toBeVisible();

      // Find the show narrative button for the expanded row
      const narrativeBtn = page.locator('[data-testid^="show-narrative-btn-"]').first();
      await narrativeBtn.click();

      // Layer 2 should now be visible
      await expect(page.locator('[data-testid="layer2-detail"]')).toBeVisible();
    });

    test('Layer 1/Layer 2 legend is visible', async ({ page }) => {
      await expect(page.getByText(/Layer 1.*authoritative/)).toBeVisible();
      await expect(page.getByText(/Layer 2.*requires click/)).toBeVisible();
    });
  });

  // --------------------------------------------------------------------------
  // View 3: Candidate Comparison (OMN-2470)
  // --------------------------------------------------------------------------

  test.describe('View 3: Candidate Comparison', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('[data-testid="tab-comparison"]');
      await page.waitForSelector('[data-testid="candidate-comparison-panel"]');
    });

    test('Candidate Comparison panel loads', async ({ page }) => {
      await expect(page.locator('[data-testid="candidate-comparison-panel"]')).toBeVisible();
    });

    test('comparison table has at least one candidate row', async ({ page }) => {
      const table = page.locator('[data-testid="candidate-comparison-table"]');
      await expect(table).toBeVisible();

      const candidateRows = page.locator('[data-testid^="candidate-row-"]');
      const count = await candidateRows.count();
      expect(count).toBeGreaterThan(0);
    });

    test('SELECTED badge is shown for the winning candidate', async ({ page }) => {
      const selectedBadges = page.getByText('SELECTED');
      await expect(selectedBadges.first()).toBeVisible();
    });

    test('ELIMINATED badge is shown for eliminated candidates (model_select view)', async ({
      page,
    }) => {
      // Default view is dr-001 (model_select) which has haiku-4-5 eliminated
      const eliminatedBadges = page.getByText('ELIMINATED');
      await expect(eliminatedBadges.first()).toBeVisible();
    });

    test('constraints section is visible', async ({ page }) => {
      await expect(page.locator('[data-testid="constraints-section"]')).toBeVisible();
    });

    test('tie-breaker section is visible', async ({ page }) => {
      await expect(page.locator('[data-testid="tie-breaker-section"]')).toBeVisible();
    });

    test('decision selector buttons allow switching between decisions', async ({ page }) => {
      const decisionBtns = page.locator('[data-testid^="select-decision-btn-"]');
      const count = await decisionBtns.count();
      expect(count).toBeGreaterThan(1);

      // Click the second decision
      await decisionBtns.nth(1).click();

      // Comparison table should still be visible with updated data
      await expect(page.locator('[data-testid="candidate-comparison-panel"]')).toBeVisible();
    });
  });

  // --------------------------------------------------------------------------
  // View 4: Agent Narrative Overlay (OMN-2471)
  // --------------------------------------------------------------------------

  test.describe('View 4: Agent Narrative Overlay', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('[data-testid="tab-narrative"]');
      await page.waitForSelector('[data-testid="narrative-overlay-panel"]');
    });

    test('Narrative Overlay panel loads', async ({ page }) => {
      await expect(page.locator('[data-testid="narrative-overlay-panel"]')).toBeVisible();
    });

    test('Layer 1 provenance panel is always visible', async ({ page }) => {
      await expect(page.locator('[data-testid="layer1-provenance-panel"]')).toBeVisible();
    });

    test('Layer 1 is labeled as authoritative', async ({ page }) => {
      await expect(page.getByText(/Causal Provenance.*Layer 1.*Authoritative/)).toBeVisible();
    });

    test('Layer 2 toggle button is visible', async ({ page }) => {
      await expect(page.locator('[data-testid="layer2-toggle-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="layer2-toggle-btn"]')).toContainText(
        'Show Agent Narrative'
      );
    });

    test('Layer 2 is hidden by default', async ({ page }) => {
      await expect(page.locator('[data-testid="layer2-narrative-panel"]')).not.toBeVisible();
    });

    test('Layer 2 becomes visible after toggle click', async ({ page }) => {
      await page.click('[data-testid="layer2-toggle-btn"]');
      await expect(page.locator('[data-testid="layer2-narrative-panel"]')).toBeVisible();
    });

    test('Layer 2 contains disclaimer text when visible', async ({ page }) => {
      await page.click('[data-testid="layer2-toggle-btn"]');
      await expect(page.locator('[data-testid="layer2-disclaimer"]')).toBeVisible();
      await expect(page.locator('[data-testid="layer2-disclaimer"]')).toContainText(
        'This is a model-generated narrative'
      );
    });

    test('mismatch banner appears for decisions with mismatch (model_select + cost mention)', async ({
      page,
    }) => {
      // The default decision (dr-001 model_select) mentions "cost" in its
      // agent_rationale but has no cost constraint in Layer 1 — mismatch detected
      await expect(page.locator('[data-testid="mismatch-banner"]')).toBeVisible();
    });

    test('Layer 2 is labeled as "Assistive, Not Authoritative" when revealed', async ({ page }) => {
      await page.click('[data-testid="layer2-toggle-btn"]');
      const panel = page.locator('[data-testid="layer2-narrative-panel"]');
      await expect(panel).toContainText('Assistive, Not Authoritative');
    });
  });
});

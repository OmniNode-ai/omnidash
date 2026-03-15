/**
 * E2E Tests — Why This Happened Panel (OMN-2469, OMN-5046)
 *
 * Covers all four views of the "Why This Happened" panel with live
 * DecisionRecord data from the /api/decisions/* endpoints.
 *
 * Uses Playwright route interception to seed the API responses so tests
 * are deterministic regardless of whether real Kafka events have been consumed.
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
 * @see OMN-5046 (live API wiring)
 */

import { test, expect } from '@playwright/test';
import type {
  DecisionRecord,
  DecisionSessionsResponse,
  DecisionTimelineResponse,
  IntentVsPlanResponse,
} from '../../shared/decision-record-types';

const WHY_URL = '/why';

// ============================================================================
// Seed data for API route interception
// ============================================================================

const SEED_SESSION_ID = 'session-e2e-test-001';

const SEED_RECORDS: DecisionRecord[] = [
  {
    decision_id: 'dr-001',
    session_id: SEED_SESSION_ID,
    decided_at: new Date(Date.now() - 62_000).toISOString(),
    decision_type: 'model_select',
    selected_candidate: 'claude-opus-4-6',
    candidates_considered: [
      {
        id: 'claude-opus-4-6',
        eliminated: false,
        selected: true,
        scoring_breakdown: { latency: 0.91, context: 1.0, tools: 1.0 },
        total_score: 0.94,
      },
      {
        id: 'claude-sonnet-4-6',
        eliminated: false,
        selected: false,
        scoring_breakdown: { latency: 0.95, context: 0.9, tools: 1.0 },
        total_score: 0.87,
      },
      {
        id: 'claude-haiku-4-5',
        eliminated: true,
        elimination_reason: 'context_length < 100k',
        selected: false,
        scoring_breakdown: {},
        total_score: null,
      },
    ],
    constraints_applied: [
      {
        description: 'context_length >= 100k',
        eliminates: ['claude-haiku-4-5'],
        satisfied_by_selected: true,
      },
      { description: 'supports_tools = true', eliminates: [], satisfied_by_selected: true },
    ],
    tie_breaker: null,
    agent_rationale:
      'I chose claude-opus-4-6 because it balances capability and cost effectively for this task.',
  },
  {
    decision_id: 'dr-002',
    session_id: SEED_SESSION_ID,
    decided_at: new Date(Date.now() - 61_500).toISOString(),
    decision_type: 'tool_select',
    selected_candidate: 'Read, Write, Bash',
    candidates_considered: [
      {
        id: 'Read, Write, Bash',
        eliminated: false,
        selected: true,
        scoring_breakdown: { coverage: 1.0, safety: 0.85 },
        total_score: 0.93,
      },
      {
        id: 'Read, Write',
        eliminated: false,
        selected: false,
        scoring_breakdown: { coverage: 0.7, safety: 1.0 },
        total_score: 0.78,
      },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale: null,
  },
  {
    decision_id: 'dr-004',
    session_id: SEED_SESSION_ID,
    decided_at: new Date(Date.now() - 61_000).toISOString(),
    decision_type: 'route_select',
    selected_candidate: 'agent-api-architect',
    candidates_considered: [
      {
        id: 'agent-api-architect',
        eliminated: false,
        selected: true,
        scoring_breakdown: { relevance: 0.95, specialization: 0.9 },
        total_score: 0.93,
      },
      {
        id: 'polymorphic-agent',
        eliminated: false,
        selected: false,
        scoring_breakdown: { relevance: 0.7, specialization: 0.5 },
        total_score: 0.62,
      },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale:
      'The user prompt mentions API design, which strongly matches agent-api-architect. Cost efficiency also favors a specialized agent.',
  },
  {
    decision_id: 'dr-003',
    session_id: SEED_SESSION_ID,
    decided_at: new Date(Date.now() - 60_500).toISOString(),
    decision_type: 'default_apply',
    selected_candidate: '30s',
    candidates_considered: [
      { id: '30s', eliminated: false, selected: true, scoring_breakdown: {}, total_score: null },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale: null,
  },
];

const SEED_SESSIONS_RESPONSE: DecisionSessionsResponse = {
  total: 1,
  sessions: [
    {
      session_id: SEED_SESSION_ID,
      decision_count: SEED_RECORDS.length,
      first_decided_at: SEED_RECORDS[0].decided_at,
      last_decided_at: SEED_RECORDS[SEED_RECORDS.length - 1].decided_at,
    },
  ],
};

const SEED_TIMELINE_RESPONSE: DecisionTimelineResponse = {
  session_id: SEED_SESSION_ID,
  total: SEED_RECORDS.length,
  rows: SEED_RECORDS.map((r) => ({
    decision_id: r.decision_id,
    decided_at: r.decided_at,
    decision_type: r.decision_type,
    selected_candidate: r.selected_candidate,
    candidates_count: r.candidates_considered.length,
    full_record: r,
  })),
};

const SEED_INTENT_RESPONSE: IntentVsPlanResponse = {
  session_id: SEED_SESSION_ID,
  executed_at: SEED_RECORDS[0].decided_at,
  fields: [
    {
      field_name: 'Model',
      intent_value: null,
      resolved_value: 'claude-opus-4-6',
      origin: 'inferred',
      decision_id: 'dr-001',
    },
    {
      field_name: 'Tools',
      intent_value: 'Read, Write',
      resolved_value: 'Read, Write, Bash',
      origin: 'inferred',
      decision_id: 'dr-002',
    },
    {
      field_name: 'Context',
      intent_value: '/my/project',
      resolved_value: '/my/project',
      origin: 'user_specified',
      decision_id: null,
    },
    {
      field_name: 'Default timeout',
      intent_value: null,
      resolved_value: '30s',
      origin: 'default',
      decision_id: 'dr-003',
    },
    {
      field_name: 'Agent',
      intent_value: null,
      resolved_value: 'agent-api-architect',
      origin: 'inferred',
      decision_id: 'dr-004',
    },
  ],
};

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Set up API route interception with seed data, then navigate to the page.
 */
async function gotoWhyPanel(page: import('@playwright/test').Page) {
  // Intercept API calls with deterministic seed data
  await page.route('**/api/decisions/sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEED_SESSIONS_RESPONSE),
    })
  );
  await page.route('**/api/decisions/timeline*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEED_TIMELINE_RESPONSE),
    })
  );
  await page.route('**/api/decisions/intent-vs-plan*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEED_INTENT_RESPONSE),
    })
  );

  await page.goto(WHY_URL);
  await page.waitForSelector('[data-testid="why-this-happened-page"]', { timeout: 10_000 });
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

  test('session picker is visible with seeded session', async ({ page }) => {
    await expect(page.locator('[data-testid="session-picker"]')).toBeVisible();
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

    test('shows at least one field row with live data', async ({ page }) => {
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
      const typeBadges = page.locator('[data-testid^="timeline-type-"]');
      const count = await typeBadges.count();
      expect(count).toBeGreaterThan(0);
    });

    test('expanding a row reveals Layer 1 detail', async ({ page }) => {
      const firstToggle = page.locator('[data-testid^="timeline-row-toggle-"]').first();
      await firstToggle.click();
      await expect(page.locator('[data-testid="layer1-detail"]')).toBeVisible();
    });

    test('Layer 2 is hidden until "Show agent narrative" is clicked', async ({ page }) => {
      const firstToggle = page.locator('[data-testid^="timeline-row-toggle-"]').first();
      await firstToggle.click();

      await expect(page.locator('[data-testid="layer2-detail"]')).not.toBeVisible();

      const narrativeBtn = page.locator('[data-testid^="show-narrative-btn-"]').first();
      await narrativeBtn.click();

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

      await decisionBtns.nth(1).click();
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
      await expect(page.locator('[data-testid="mismatch-banner"]')).toBeVisible();
    });

    test('Layer 2 is labeled as "Assistive, Not Authoritative" when revealed', async ({ page }) => {
      await page.click('[data-testid="layer2-toggle-btn"]');
      const panel = page.locator('[data-testid="layer2-narrative-panel"]');
      await expect(panel).toContainText('Assistive, Not Authoritative');
    });
  });
});

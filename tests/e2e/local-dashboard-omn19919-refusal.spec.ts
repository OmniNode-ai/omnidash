import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

const DECISIONS = prefix + 'delegation.decisions.v1';
const CORRELATION_ID = 'omn19919-ac8-keyless-refusal';
const RAW_CAUSE = 'refused_before_dispatch';
const CAUSE_LABEL = 'Refused before dispatch';
const runLink = (page: Page) => page.getByRole('link', { name: CORRELATION_ID, exact: true });

// The fresh-HOME invocation is separate lab evidence; this fixture pins the rendered Runs representation.
const keylessRefusalDecision: Record<string, unknown> = {
  ...(chartRows[DECISIONS][0] as Record<string, unknown>),
  correlation_id: CORRELATION_ID,
  created_at: '2026-10-24T12:00:00Z',
  written_at: '2026-10-24T12:00:00Z',
  terminal_ok: 0,
  quality_gate_passed: null,
  quality_gate_detail: RAW_CAUSE,
  terminal_failure_cause: RAW_CAUSE,
};

async function assertRunLink(page: Page, timeout = 5000) {
  await expect(runLink(page)).toHaveAttribute(
    'href',
    '/workflow?correlation_id=' + CORRELATION_ID,
    { timeout },
  );
}

test('AC8: a refused run is visible on Runs with its cause and correlation link', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [DECISIONS]: [keylessRefusalDecision] });
  await page.goto('/runs?status=failed');

  const rows = page.locator('.local-runs-wrap tbody tr');
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await assertRunLink(page);
  await expect(row.locator('[data-failure-cause="' + RAW_CAUSE + '"]')).toHaveText(CAUSE_LABEL);

  const cause = page.getByLabel('Cause', { exact: true });
  await cause.selectOption(RAW_CAUSE);
  await expect(cause).toHaveValue(RAW_CAUSE);
  await expect(cause.locator('option:checked')).toHaveText(CAUSE_LABEL);
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('failed');
  await expect.poll(() => new URL(page.url()).searchParams.get('cause')).toBe(RAW_CAUSE);

  const visibleText = await page.locator('.app').innerText();
  expect(visibleText).not.toContain(RAW_CAUSE);
});

test('positive control: the correlation-link probe rejects when the refusal row is absent', async ({ page }) => {
  await serveCharts(page, { ...chartRows, [DECISIONS]: [] });
  await page.goto('/runs?status=failed');
  // The page must have loaded, so the rejection below is the missing row and not a blank page.
  await expect(page.getByRole('heading', { level: 1, name: 'Runs', exact: true })).toBeVisible();

  let probeRejected = false;
  try {
    await assertRunLink(page, 500);
  } catch {
    probeRejected = true;
  }
  expect(probeRejected, 'the same link assertion must fail when the row is absent').toBe(true);
});

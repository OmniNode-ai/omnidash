import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// These checks inspect the rendered SVG and computed ink, not identity metadata
// alone. Wrong per-page icons and CSS overrides must remain observable.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

for (const scenario of [
  { name: 'passed', passed: true, icon: 'lucide-circle-check' },
  { name: 'failed', passed: false, icon: 'lucide-circle-x' },
  { name: 'unknown', passed: null, icon: 'lucide-circle-dot' },
]) {
  test(`AC2 Workflow ${scenario.name}: model and outcome use the canonical rendered identity`, async ({ page }, info) => {
    const run = { ...(chartRows[prefix + 'delegation.decisions.v1'][0] as object),
      correlation_id: 'identity-run', quality_gate_passed: scenario.passed, terminal_ok: scenario.passed };
    await serveCharts(page, { ...chartRows,
      [prefix + 'delegation.decisions.v1']: [run], [prefix + 'run-trace.v1']: [],
      [prefix + 'delegation.correlation-trace.v1']: [run],
    });
    await page.goto('/workflow?correlation_id=identity-run');
    const flow = page.getByRole('region', { name: 'Recorded routing flow', exact: true });
    await expect(flow).toBeVisible();
    await expect(flow.locator('[data-flow-kind="model"] strong')).toContainText('model-a');
    for (const theme of ['light', 'dark']) {
      const current = await page.locator('html').getAttribute('data-theme');
      if ((current === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
      const model = flow.locator('[data-flow-kind="model"] > svg');
      await expect(model).toHaveClass(/lucide-brain-circuit/);
      const summary = page.locator('[data-summary-field="Model"] dt svg');
      await expect(summary).toHaveCount(1);
      expect(await model.evaluate(el => el.innerHTML)).toBe(await summary.evaluate(el => el.innerHTML));
      expect(await model.evaluate(el => getComputedStyle(el).color)).toBe(await summary.evaluate(el => getComputedStyle(el).color));
      const outcome = flow.locator('[data-flow-kind="outcome"] > svg');
      await expect(outcome).toHaveClass(new RegExp(scenario.icon));
      await expect(outcome).not.toHaveClass(/lucide-award/);
      await page.screenshot({ path: info.outputPath(`workflow-${scenario.name}-${theme}.png`) });
    }
  });
}

test('AC2 Without a tier uses RouteOff, distinct from tier-routed runs in both themes', async ({ page }, info) => {
  const routing = chartRows[prefix + 'delegation.model-routing.v1'][0] as Record<string, unknown>;
  await serveCharts(page, { ...chartRows, [prefix + 'delegation.model-routing.v1']: [{ ...routing,
    by_tier: { ...routing.by_tier as object, local_call_share: .6, local_call_count: 6, total_call_count: 10 },
  }] });
  await page.goto('/overview');
  await page.locator('summary').filter({ hasText: 'Additional runtime metrics' }).click();
  const untiered = page.locator('[data-routing-count="untiered"]');
  // The native routing count section can be folded under its existing disclosure.
  const fold = page.locator('details').filter({ has: untiered });
  if (await fold.count() && await fold.getAttribute('open') === null) await fold.locator(':scope > summary').click();
  await expect(untiered).toContainText('Without a tier');
  for (const theme of ['light', 'dark']) {
    const current = await page.locator('html').getAttribute('data-theme');
    if ((current === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(untiered.locator('dt svg')).toHaveClass(/lucide-route-off/);
    await expect(untiered.locator('dt svg')).not.toHaveClass(/lucide-route(?:\s|$)/);
    await page.screenshot({ path: info.outputPath(`without-tier-${theme}.png`) });
  }
});

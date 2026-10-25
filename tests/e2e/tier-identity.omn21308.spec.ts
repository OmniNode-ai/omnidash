import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Remaining AC1/AC2 failure mode found by the actual census: a named tier's
// icon, served-share chart and run-count chart use three independent palettes.
// Written before changing any tier resolver or palette.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce' });
for (const selectedTheme of ['light', 'dark']) {
  test(`AC1: named tier icons, share marks and run-count bars agree, ${selectedTheme}`, async ({ page }, info) => {
    const topic = prefix + 'delegation.decisions.v1';
    const day = new Date().toISOString().slice(0, 10);
    const rows = { ...chartRows, [topic]: chartRows[topic].map((row, index) => ({
      ...row as object, created_at: `${day}T10:0${index}:00Z`, written_at: `${day}T10:0${index}:00Z`,
      cost_tier_name: index === 1 ? 'cloud' : 'local',
    })) };
    await serveCharts(page, rows);
    await page.goto('/overview');
    const activeTheme = await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (activeTheme !== selectedTheme) await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    // OMN-21166 Maple grid / AC64: Overview's run counts are the ranked "Runs by tier" bars (the mark is the bar's
    // colour and the name beside it); the tier icon, share swatch and share bar are Runs' routing breakdown, under
    // "More analysis". The donut is gone. The same tier must read in the same colour on both pages.
    const counts = page.getByRole('figure', { name: 'Runs by tier', exact: true });
    await expect(counts).toBeVisible();
    const evidence: Record<string, { icon: string; share: string; legend: string; count: string; countName: string }> = {};
    for (const tier of ['local', 'cloud']) {
      const item = counts.locator(`li[data-ranked-item^="${tier}-"]`);
      await expect(item).toHaveCount(1);
      await expect(item.locator('.rb-bar')).toBeVisible();
      evidence[tier] = { icon: '', share: '', legend: '', count: await item.locator('.rb-bar').evaluate(el => getComputedStyle(el).color),
        countName: await item.locator('.rb-name').evaluate(el => getComputedStyle(el).color) };
    }
    await page.goto('/runs');
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${selectedTheme}`));
    await page.getByText('More analysis', { exact: true }).click();
    const mix = page.locator('[data-component="runs-tier-mix"]');
    await mix.locator('details.local-tier-details > summary').click();
    for (const tier of ['local', 'cloud']) {
      const label = tier === 'local' ? 'Local' : 'Cloud'; // the page words a tier by its plain label
      const tierRow = mix.locator('.local-routing-tier-row').filter({ has: page.getByText(label, { exact: true }) });
      await expect(tierRow).toHaveCount(1);
      const icon = tierRow.locator('svg').first();
      await expect(icon).toBeVisible();
      evidence[tier]!.icon = await icon.evaluate(el => getComputedStyle(el).color);
      const select = mix.getByRole('button', { name: `Inspect ${label}`, exact: true });
      evidence[tier]!.legend = await select.locator('.local-share-swatch').evaluate(el => getComputedStyle(el).backgroundColor);
      const bar = mix.getByTestId(`tier-bar-${tier}`);
      await expect(bar).toBeVisible();
      evidence[tier]!.share = await bar.evaluate(el => getComputedStyle(el).backgroundColor);
    }
    await info.attach('tier-colors', { body: JSON.stringify({ theme: selectedTheme, evidence }), contentType: 'application/json' });
    for (const [tier, colors] of Object.entries(evidence)) {
      expect(colors.share, `${tier}: icon and served tier share`).toBe(colors.icon);
      expect(colors.legend, `${tier}: icon and share legend`).toBe(colors.icon);
      expect(colors.count, `${tier}: icon and run-count mark`).toBe(colors.icon);
      expect(colors.countName, `${tier}: icon and run-count name`).toBe(colors.icon);
    }
    expect(evidence.local.icon, 'different named tiers must remain distinguishable').not.toBe(evidence.cloud.icon);
    await page.screenshot({ path: info.outputPath('tier-identities.png'), fullPage: true, animations: 'disabled' });
  });
}

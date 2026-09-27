import { expect, test } from 'playwright/test';

test('compares GitGraph and SVG against the same historical topology with synthetic watermarks', async ({ page }) => {
  await page.setViewportSize({ width: 2480, height: 900 });
  await page.goto('/iframe.html?id=delegation-execution-graph-renderer-comparison--real-five-hop&viewMode=story');

  const gitGraph = page.getByRole('region', { name: 'Git-style graph renderer' });
  const svgTree = page.getByRole('region', { name: 'SVG tree renderer' });
  await expect(gitGraph).toBeVisible();
  await expect(svgTree).toBeVisible();
  await expect(page.getByText('5 nodes · 4 recorded edges')).toBeVisible();
  await expect(gitGraph.locator('svg')).toBeVisible();
  await expect(gitGraph.getByText('✓ delegate-skill.v1')).toBeVisible();
  await expect(gitGraph.getByText('✓ delegation-request.v1')).toBeVisible();
  await expect(gitGraph.locator('svg circle')).toHaveCount(5);
  await expect(svgTree.getByRole('group', { name: 'Recorded delegation execution graph' })).toBeVisible();
  await expect(svgTree.locator('.execution-graph-node')).toHaveCount(5);
  await expect(svgTree.getByRole('button')).toHaveCount(5);
  expect(await svgTree.locator('.execution-graph-svg-scroll').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const secondHop = svgTree.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ });
  await secondHop.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeVisible();
  await page.locator('.execution-graph-spike').screenshot({ path: 'tests/screenshots/execution-graph-renderer-comparison-real-five-hop.png' });
});

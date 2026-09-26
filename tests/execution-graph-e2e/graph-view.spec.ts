import { expect, test } from 'playwright/test';

test('provisional execution graph renders projection, details, and cursor controls', async ({ page }) => {
  await page.goto('/iframe.html?id=delegation-execution-graph-view--provisional&viewMode=story');
  await expect(page.getByRole('group', { name: 'Recorded delegation execution graph' })).toBeVisible();
  await expect(page.getByText('2 recorded nodes, 1 recorded edges')).toBeVisible();
  await page.getByRole('button', { name: /root\.v1/ }).click();
  await expect(page.getByText('env-root')).toBeVisible();
  await page.getByRole('button', { name: 'Later bound' }).click();
  await expect(page.getByText('fold 1.0.0')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-provisional.png', fullPage: true });
});

test('real five-hop fixture renders interactive graph, status counts, and selected evidence', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/iframe.html?id=delegation-execution-graph-view--real-five-hop-fixture&viewMode=story');

  const graph = page.getByRole('group', { name: 'Recorded delegation execution graph' });
  await expect(graph).toBeVisible();
  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(page.getByText('Replay passed (5)')).toBeVisible();
  await expect(page.getByText('Replay failed (0)')).toBeVisible();
  await expect(page.getByText('Unknown (0)')).toBeVisible();
  await expect(graph.locator('.execution-graph-node')).toHaveCount(5);
  await expect(graph.locator('path[data-edge-kind]')).toHaveCount(4);

  await graph.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ }).click();
  await expect(page.getByText('d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeVisible();
  await expect(page.getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeVisible();
  await expect(page.getByText('partition 0, offset 2174')).toBeVisible();

  await graph.getByRole('button', {
    name: /caused edge\. 97767c23-a7e5-485f-b747-0e0bf6ee24e7 to d88c5031-0da9-462a-80ef-8cc817934cc6/,
  }).click();
  await expect(page.getByText('Recorded edge', { exact: true })).toBeVisible();
  await expect(page.getByText('parent:d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeVisible();
  await expect(page.getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeVisible();
  await expect(page.getByText('partition 0, offset 2174')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Earlier bound' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Later bound' })).toBeEnabled();
  await page.getByRole('button', { name: 'Earlier bound' }).click();
  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(page.getByText('Recorded edge', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-real-five-hop-view.png', fullPage: true });
});

test('typed fixture transport proves backward/forward UI states and mixed replay badges', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/iframe.html?id=delegation-execution-graph-view--status-and-playback-fixture&viewMode=story');

  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(page.getByText('Replay passed (3)')).toBeVisible();
  await expect(page.getByText('Replay failed (1)')).toBeVisible();
  await expect(page.getByText('Unknown (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Earlier bound' }).click();
  await expect(page.getByText('3 recorded nodes, 2 recorded edges')).toBeVisible();
  await expect(page.getByText('Replay passed (1)')).toBeVisible();
  await expect(page.getByText('Replay failed (1)')).toBeVisible();
  await expect(page.getByText('Unknown (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Later bound' }).click();
  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(page.getByText('Replay passed (3)')).toBeVisible();
  await expect(page.getByText('Replay failed (1)')).toBeVisible();
  await expect(page.getByText('Unknown (1)')).toBeVisible();
  await page.getByRole('button', { name: /delegation-request\.v1\. Replay failed/ }).click();
  await expect(page.getByText('Replay grade')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-status-and-playback-fixture.png', fullPage: true });
});

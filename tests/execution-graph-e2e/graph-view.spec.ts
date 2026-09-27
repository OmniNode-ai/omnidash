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
  await expect(page.getByText('onex.cmd.omnibase-infra.delegation-request.v1', { exact: true })).toBeVisible();
  await expect(page.getByText('partition 0, offset 2174')).toBeVisible();

  await graph.getByRole('button', {
    name: /caused edge\. 97767c23-a7e5-485f-b747-0e0bf6ee24e7 to d88c5031-0da9-462a-80ef-8cc817934cc6/,
  }).click();
  await expect(page.getByText('Recorded edge', { exact: true })).toBeVisible();
  await expect(page.getByText('parent:d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeVisible();
  await expect(page.getByText('onex.cmd.omnibase-infra.delegation-request.v1', { exact: true })).toBeVisible();
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

test('fixture details distinguish recomputed and stored grades and resolve the source row', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/iframe.html?id=delegation-execution-graph-view--stored-grade-disagreement-fixture&viewMode=story');

  const graph = page.getByRole('group', { name: 'Recorded delegation execution graph' });
  await expect(graph).toBeVisible();
  await expect(page.getByRole('note')).toHaveText(
    'Synthetic UI fixture only — stored-grade disagreement and ingest watermarks are not captured run evidence.',
  );
  const node = graph.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ });
  await node.click();

  const details = page.getByRole('region', { name: 'Selected graph evidence' });
  await expect(details.getByText('Replay grade', { exact: true })).toBeVisible();
  await expect(details.getByText('Replay passed', { exact: true })).toBeVisible();
  await expect(details.getByText('Stored chain annotation', { exact: true })).toBeVisible();
  await expect(details.getByText('hop 1: failed / fail', { exact: true })).toBeVisible();

  await expect(details.getByText('Envelope', { exact: true })).toBeVisible();
  await expect(details.getByText('d88c5031-0da9-462a-80ef-8cc817934cc6', { exact: true })).toBeVisible();
  await expect(details.getByText('Topic', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.cmd.omnibase-infra.delegation-request.v1', { exact: true })).toBeVisible();
  await expect(details.getByText('partition 0, offset 2174', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-stored-grade-disagreement-fixture.png', fullPage: true });
});

test('selected detail exposes projected labels, pinned versions, and source cursor bounds', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/iframe.html?id=delegation-execution-graph-view--projection-detail-fields-fixture&viewMode=story');

  await expect(page.getByRole('note')).toHaveText(
    'Historical topology; timestamps and ingest watermarks are synthetic fixture values, not captured run evidence.',
  );
  const graph = page.getByRole('group', { name: 'Recorded delegation execution graph' });
  await graph.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ }).click();

  const details = page.getByRole('region', { name: 'Selected graph evidence' });
  await expect(details.getByText('Event timestamp label', { exact: true })).toBeVisible();
  await expect(details.getByText('2026-09-26T12:00:00Z', { exact: true })).toBeVisible();
  await expect(details.getByText('Ledger written at', { exact: true })).toBeVisible();
  await expect(details.getByText('2026-09-26T12:00:01Z', { exact: true })).toBeVisible();
  await expect(details.getByText('Pinned topology version', { exact: true })).toBeVisible();
  await expect(details.getByText(/1\.3\.0 · SHA-256 0505ab0b163492380739a15646c0442a3ecfb54efb0acb53bc23d232640fbfd3/)).toBeVisible();
  await expect(details.getByText('Pinned grader version', { exact: true })).toBeVisible();
  await expect(details.getByText('1.0.0', { exact: true })).toBeVisible();
  await expect(details.getByText('Source cursor bounds (5)', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.cmd.omnibase-infra.delegation-request.v1 — partition 0, through ingest watermark 1', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.cmd.omnibase-infra.delegation-routing-request.v1 — partition 0, through ingest watermark 1', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.cmd.omnimarket.delegate-skill.v1 — partition 0, through ingest watermark 1', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.evt.omnibase-infra.routing-decision.v1 — partition 0, through ingest watermark 1', { exact: true })).toBeVisible();
  await expect(details.getByText('onex.evt.omnimarket.delegate-skill-completed.v1 — partition 0, through ingest watermark 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-projection-detail-fields-fixture.png', fullPage: true });
});

test('fixture status lists unresolved and withheld evidence without adding edges', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/iframe.html?id=delegation-execution-graph-view--unresolved-and-withheld-fixture&viewMode=story');

  const graph = page.getByRole('group', { name: 'Recorded delegation execution graph' });
  await expect(graph).toBeVisible();
  await expect(page.getByRole('note')).toHaveText(
    'Synthetic status fixture only — unresolved, withheld, and ingest watermark values are test-only, not captured run evidence.',
  );
  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(graph.locator('path[data-edge-kind]')).toHaveCount(4);

  const status = page.getByRole('region', { name: 'Graph evidence status' });
  await expect(status.getByText('Session anchor: unresolved')).toBeVisible();
  await expect(status.getByText('Unresolved records (1)')).toBeVisible();
  await expect(status.getByText('missing_parent')).toBeVisible();
  await expect(status.getByText('00000000-0000-4000-8000-000000000001')).toBeVisible();
  await expect(status.getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeVisible();
  await expect(status.getByText('partition 0, offset 2174')).toBeVisible();
  await expect(status.getByText('Withheld evidence: 2')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-unresolved-withheld-fixture.png', fullPage: true });
});

test('correlation panel toggles Events to the exact five-hop fixture and back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.route('**/_fixtures/**', (route) => route.fulfill({ json: { rows: [] } }));
  await page.route('**/projection/**', (route) => route.fulfill({ json: { rows: [] } }));
  await page.goto('/iframe.html?id=delegation-correlation-trace-panel--real-five-hop-fixture&viewMode=story');

  const view = page.getByRole('group', { name: 'Correlation trace view' });
  await expect(view).toBeVisible();
  await expect(page.getByText('projection-backed')).toHaveCount(0);
  await expect(page.getByText(/Fixture event chain.*No live projection is connected/i)).toBeVisible();
  await expect(page.getByText(/Source: delegation_events table/i)).toHaveCount(0);
  await expect(view.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/No events found/i)).toBeVisible();

  await view.getByRole('button', { name: 'Execution graph' }).click();
  const graph = page.getByRole('group', { name: 'Recorded delegation execution graph' });
  await expect(graph).toBeVisible();
  await expect(page.getByText('Fixture graph — no live projection.')).toBeVisible();
  await expect(page.getByText('5 recorded nodes, 4 recorded edges')).toBeVisible();
  await expect(graph.locator('.execution-graph-node')).toHaveCount(5);
  await expect(graph.locator('path[data-edge-kind]')).toHaveCount(4);

  await graph.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ }).click();
  await expect(page.getByText('Selected evidence')).toBeVisible();
  await expect(page.getByText('d88c5031-0da9-462a-80ef-8cc817934cc6')).toBeVisible();
  await expect(page.getByText('onex.cmd.omnibase-infra.delegation-request.v1', { exact: true })).toBeVisible();
  await expect(page.getByText('partition 0, offset 2174')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/execution-graph-panel-integration.png', fullPage: true });

  await view.getByRole('button', { name: 'Events' }).click();
  await expect(view.getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/No events found/i)).toBeVisible();
  await expect(graph).not.toBeVisible();
});

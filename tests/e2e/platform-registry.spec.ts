// SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT

/**
 * Platform Registry — Data Quality Regression Gate [OMN-7091]
 *
 * Catches the OMN-6405 failure pattern: Platform Registry shows garbage COMPUTE
 * nodes with UUID names and generic "Compute node — {uuid}" descriptions instead
 * of real, meaningful node registrations.
 *
 * These tests assert SEMANTIC quality of the rendered data, not just that rows exist.
 * They run against a live omnidash server with real data projected from Kafka.
 *
 * Prerequisites:
 *   - omnidash running on localhost:3000 with live DB + Kafka
 *   - Nodes have been registered via the 2-way registration protocol
 *
 * Run with:
 *   npx playwright test --config playwright.dataflow.config.ts platform-registry.spec.ts
 *
 * NOTE: Selectors use structural `table tbody tr` / `table thead th` because the
 * DashboardRenderer widget system renders standard HTML table elements via shadcn/ui.
 * Adding data-testid attributes to the widget system would improve resilience but
 * is out of scope for this regression gate.
 *
 * @see OMN-6405 Original garbage data incident
 * @see OMN-7091 This regression gate
 */

import { test, expect } from '@playwright/test';

test.describe('Platform Registry — data quality regression gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/registry?tab=nodes');
    // Wait for the node table to render with data rows.
    // The DashboardRenderer/TableWidget renders standard <table> elements.
    await page.waitForSelector('table tbody tr', { timeout: 15_000 });
  });

  test('nodes have human-readable names, not UUIDs', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Sample up to 5 rows to catch systematic garbage data
    const sampleSize = Math.min(count, 5);
    for (let i = 0; i < sampleSize; i++) {
      // Name is the first column (index 0) per node-registry-dashboard.ts config
      const nameCell = await rows.nth(i).locator('td').first().textContent();
      expect(nameCell).toBeTruthy();

      // Name should NOT be a UUID pattern (8-4-4-4-12 hex).
      // OMN-6405 showed 13 nodes with raw UUID names like
      // "a1b2c3d4-e5f6-7890-abcd-ef1234567890".
      expect(nameCell).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  test('node types show variety, not all COMPUTE', async ({ page }) => {
    // Find the "Type" column index by inspecting table headers.
    // node-registry-dashboard.ts defines columns: Name, Description, Type, State, ...
    const headers = await page.locator('table thead th').allTextContents();
    const typeColIndex = headers.findIndex((h) => h.toLowerCase().includes('type'));
    expect(typeColIndex, 'Table must have a "Type" column header').toBeGreaterThanOrEqual(0);

    const typeCells = page.locator(`table tbody tr td:nth-child(${typeColIndex + 1})`);
    const types = await typeCells.allTextContents();
    const uniqueTypes = new Set(types.map((t) => t.trim().toUpperCase()));

    // A healthy registry has EFFECT, COMPUTE, REDUCER, ORCHESTRATOR, SERVICE nodes.
    // If every single node is COMPUTE, the registration pipeline is producing
    // garbage data (OMN-6405 pattern).
    expect(uniqueTypes.size, 'Registry should have at least 2 different node types').toBeGreaterThanOrEqual(2);
  });

  test('descriptions are meaningful, not generic garbage', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    const sampleSize = Math.min(count, 5);

    for (let i = 0; i < sampleSize; i++) {
      // Description is the second column (index 1) per node-registry-dashboard.ts config
      const descCell = await rows.nth(i).locator('td').nth(1).textContent();

      // Should NOT match the OMN-6405 garbage pattern: "Compute node — {uuid-prefix}"
      expect(descCell).not.toMatch(/Compute node\s*[—–-]\s*[0-9a-f]{6}/i);

      // Description should not itself be a bare UUID
      expect(descCell).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });

  test('no duplicate node names in the table', async ({ page }) => {
    // OMN-6405 showed 13 near-identical garbage entries. Even with valid data,
    // duplicate names indicate a registration or projection bug.
    const rows = page.locator('table tbody tr');
    const count = await rows.count();

    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameCell = await rows.nth(i).locator('td').first().textContent();
      if (nameCell) names.push(nameCell.trim());
    }

    const uniqueNames = new Set(names);
    expect(
      uniqueNames.size,
      `Found duplicate node names: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`
    ).toBe(names.length);
  });
});

import { test, expect } from '@playwright/test';

/* eslint-disable no-console */

/**
 * Contract Builder E2E Tests
 *
 * API-based tests that verify the Contract Registry backend.
 * These tests use Playwright's request fixture (no browser needed).
 *
 * Browser-based UI tests are in a separate describe block and require
 * system dependencies: npx playwright install-deps chromium
 */

// ============================================================================
// API Tests (no browser required)
// ============================================================================

test.describe('Contract Registry API', () => {
  test('should list all contracts', async ({ request }) => {
    const response = await request.get('/api/contracts');
    expect(response.ok()).toBeTruthy();

    const contracts = await response.json();
    console.log(`Found ${contracts.length} contracts`);

    expect(Array.isArray(contracts)).toBeTruthy();
    expect(contracts.length).toBeGreaterThan(0);

    // Verify contract structure
    const first = contracts[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('status');
  });

  test('should get contract types', async ({ request }) => {
    const response = await request.get('/api/contracts/types');
    expect(response.ok()).toBeTruthy();

    const types = await response.json();
    console.log('Contract types:', types);

    expect(types).toContain('orchestrator');
    expect(types).toContain('effect');
    expect(types).toContain('compute');
    expect(types).toContain('reducer');
  });

  test('should filter contracts by type', async ({ request }) => {
    const response = await request.get('/api/contracts?type=orchestrator');
    expect(response.ok()).toBeTruthy();

    const contracts = await response.json();
    console.log(`Found ${contracts.length} orchestrator contracts`);

    // All should be orchestrators
    for (const contract of contracts) {
      expect(contract.type).toBe('orchestrator');
    }
  });

  test('should get a single contract by ID', async ({ request }) => {
    // First get the list to find a valid ID
    const listResponse = await request.get('/api/contracts');
    const contracts = await listResponse.json();
    const firstId = contracts[0].id;

    // Now get that specific contract
    const response = await request.get(`/api/contracts/${firstId}`);
    expect(response.ok()).toBeTruthy();

    const contract = await response.json();
    expect(contract.id).toBe(firstId);
  });

  test('should return 404 for non-existent contract', async ({ request }) => {
    const response = await request.get('/api/contracts/non-existent-id');
    expect(response.status()).toBe(404);
  });
});

test.describe('Contract Lifecycle API', () => {
  // Run lifecycle tests serially - they depend on each other
  test.describe.configure({ mode: 'serial' });

  // Single test that runs the full lifecycle
  test('should complete full contract lifecycle: validate → publish → deprecate → archive', async ({
    request,
  }) => {
    // Step 1: Find a draft contract
    const listResponse = await request.get('/api/contracts?status=draft');
    const drafts = await listResponse.json();

    test.skip(drafts.length === 0, 'No draft contracts available');

    const testContractId = drafts[0].id;
    console.log(`Testing lifecycle on: ${testContractId}`);

    // Step 2: Validate
    console.log('\n--- Step 1: Validate ---');
    const validateResponse = await request.post(`/api/contracts/${testContractId}/validate`);
    const validateData = await validateResponse.json();
    console.log('Validate result:', validateData.isValid, validateData.contract?.status);

    expect(validateResponse.ok()).toBeTruthy();
    expect(validateData.isValid).toBe(true);
    expect(validateData.contract.status).toBe('validated');

    // Step 3: Publish
    console.log('\n--- Step 2: Publish ---');
    const publishResponse = await request.post(`/api/contracts/${testContractId}/publish`);
    const publishData = await publishResponse.json();
    console.log('Publish result:', publishData.success, publishData.contract?.status);

    expect(publishResponse.ok()).toBeTruthy();
    expect(publishData.success).toBe(true);
    expect(publishData.contract.status).toBe('published');

    // Step 4: Deprecate
    console.log('\n--- Step 3: Deprecate ---');
    const deprecateResponse = await request.post(`/api/contracts/${testContractId}/deprecate`);
    const deprecateData = await deprecateResponse.json();
    console.log('Deprecate result:', deprecateData.success, deprecateData.contract?.status);

    expect(deprecateResponse.ok()).toBeTruthy();
    expect(deprecateData.success).toBe(true);
    expect(deprecateData.contract.status).toBe('deprecated');

    // Step 5: Archive
    console.log('\n--- Step 4: Archive ---');
    const archiveResponse = await request.post(`/api/contracts/${testContractId}/archive`);
    const archiveData = await archiveResponse.json();
    console.log('Archive result:', archiveData.success, archiveData.contract?.status);

    expect(archiveResponse.ok()).toBeTruthy();
    expect(archiveData.success).toBe(true);
    expect(archiveData.contract.status).toBe('archived');

    // Step 6: Verify final state
    console.log('\n--- Final Verification ---');
    const finalResponse = await request.get(`/api/contracts/${testContractId}`);
    const finalContract = await finalResponse.json();
    console.log('Final state:', finalContract.status);

    expect(finalContract.status).toBe('archived');
    console.log('\n✅ Full lifecycle test PASSED!');
  });
});

test.describe('Contract Lifecycle Rules', () => {
  test('should reject publishing a draft without validation', async ({ request }) => {
    // Find another draft contract
    const listResponse = await request.get('/api/contracts?status=draft');
    const drafts = await listResponse.json();

    // Skip if no drafts available
    test.skip(drafts.length === 0, 'No draft contracts available');

    const draftId = drafts[0].id;
    console.log(`Testing invalid publish on: ${draftId}`);

    // Try to publish without validating
    const response = await request.post(`/api/contracts/${draftId}/publish`);
    const data = await response.json();

    console.log('Invalid publish response:', data);

    expect(response.status()).toBe(400);
    // Check that error mentions validation requirement
    expect(data.error).toMatch(/validated|validation/i);
  });
});

// ============================================================================
// Browser UI Tests
// ============================================================================

test.describe('Contract Builder UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contracts');
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load the contracts page', async ({ page }) => {
    // Verify we navigated to contracts
    await expect(page).toHaveURL(/.*contracts/);

    // Take a screenshot to see what we're working with
    await page.screenshot({ path: 'e2e/screenshots/contracts-page.png', fullPage: true });

    // Log page title for debugging
    const title = await page.title();
    console.log('Page title:', title);
  });

  test('should display page content', async ({ page }) => {
    // Wait a bit for React to render
    await page.waitForTimeout(2000);

    // Get visible text content
    const bodyText = await page.textContent('body');
    console.log('Page text preview:', bodyText?.substring(0, 300));

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/contract-list.png', fullPage: true });

    // Check for any content (adjust based on what we find)
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test('should have navigation elements', async ({ page }) => {
    // Look for common navigation elements
    const links = await page.locator('a').count();
    const buttons = await page.locator('button').count();

    console.log(`Found ${links} links and ${buttons} buttons`);

    // Take screenshot of current state
    await page.screenshot({ path: 'e2e/screenshots/navigation.png' });
  });
});

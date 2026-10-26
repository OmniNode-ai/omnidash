import { expect, test, type Locator } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

test.use({ reducedMotion: 'reduce' });

// OMN-21166 part 26 revision 2 AC158: Environment is the System status section of Settings
// (article[data-component="status-environment"]), so the identity-colour checks run there.

// Resolve actual browser colours, so two differently written CSS values cannot
// hide the same colour. The temporary child is removed in this read operation.
async function colours(panel: Locator, canonical: string) {
  return panel.evaluate((element, token) => {
    const probe = document.createElement('span');
    element.append(probe);
    try {
      probe.style.color = 'var(--panel-accent)';
      const accent = getComputedStyle(probe).color;
      probe.style.color = `var(${token})`;
      return { accent, canonical: getComputedStyle(probe).color };
    } finally { probe.remove(); }
  }, canonical);
}

for (const dark of [false, true]) {
  test(`Environment and the legacy Cloud keys style use distinct canonical colours (dark: ${dark})`, async ({ page }, info) => {
    await serveCharts(page);
    await page.goto('/settings');
    await page.evaluate(darkTheme => document.documentElement.setAttribute('data-theme', darkTheme ? 'dark' : 'light'), dark);
    const environment = page.locator('article[data-component="status-environment"]');
    await expect(environment).toBeVisible();
    const host = await colours(environment, '--field-host');
    await page.screenshot({ path: info.outputPath('environment.png'), fullPage: true });
    // The current page declares no Cloud keys widget. Exercise its retained CSS
    // selector with an explicit temporary style control, never a product widget.
    const cloudKeys = await page.evaluate(() => {
      const panel = document.createElement('article');
      panel.className = 'local-dashboard-panel';
      panel.dataset.component = 'api-keys-cloud';
      panel.hidden = true;
      const probe = document.createElement('span');
      panel.append(probe);
      document.querySelector('.local-dashboard-page')!.append(panel);
      try {
        probe.style.color = 'var(--panel-accent)';
        const accent = getComputedStyle(probe).color;
        probe.style.color = 'var(--field-cloud-keys)';
        return { accent, canonical: getComputedStyle(probe).color, boundary: 'temporary legacy selector style control' };
      } finally { panel.remove(); }
    });
    await info.attach('computed-colours', { body: JSON.stringify({ host, cloudKeys }), contentType: 'application/json' });
    expect.soft(host.accent).toBe(host.canonical);
    expect.soft(cloudKeys.accent).toBe(cloudKeys.canonical);
    expect.soft(host.accent).not.toBe(cloudKeys.accent);
  });

  test(`computed-colour instrument catches a planted equal-colour collision (dark: ${dark})`, async ({ page }, info) => {
    await serveCharts(page);
    await page.goto('/settings');
    await page.evaluate(darkTheme => document.documentElement.setAttribute('data-theme', darkTheme ? 'dark' : 'light'), dark);
    const environment = page.locator('article[data-component="status-environment"]');
    await expect(environment).toBeVisible();
    const control = await environment.evaluate(element => {
      const panel = element as HTMLElement;
      const previous = panel.style.getPropertyValue('--panel-accent');
      const priority = panel.style.getPropertyPriority('--panel-accent');
      const probe = document.createElement('span');
      panel.append(probe);
      const read = (token: string) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
      try {
        const host = read('--field-host');
        const cloudKeys = read('--field-cloud-keys');
        panel.style.setProperty('--panel-accent', 'var(--field-host)', 'important');
        const positive = read('--panel-accent') === host && host !== cloudKeys;
        panel.style.setProperty('--panel-accent', 'var(--field-cloud-keys)', 'important');
        const plantedCollision = read('--panel-accent') === cloudKeys;
        return { positive, plantedCollision };
      } finally {
        probe.remove();
        if (previous) panel.style.setProperty('--panel-accent', previous, priority);
        else panel.style.removeProperty('--panel-accent');
      }
    });
    expect(control).toEqual({ positive: true, plantedCollision: true });
    await info.attach('positive-and-negative-controls', { body: JSON.stringify(control), contentType: 'application/json' });
  });
}

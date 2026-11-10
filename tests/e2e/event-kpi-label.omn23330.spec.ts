// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 AC32 (lab compare, 2026-11-10): on Event Bus and Agent Workbench each summary card's label row is its icon and its
// name side by side on one centre line, as on dev. With the pages loaded lazily (AC22) field-identity.css arrived after
// event-dash.css, so its equal-weight rule for the same row (baseline, 5 px gap) won over event-dash's (centre, 7 px):
// the name dropped to the icon's foot and every card grew 5 px.
// Failure modes:
//   K1  a label's name sits off its icon's centre line by more than 1 px;
//   K2  the row's gap is not event-dash's 7 px;
//   K3  the instrument is blind: no label row, or a row without an icon, is measured;
//   K4  the other rules both stylesheets give one selector win by load order too: a passed or failed badge must wear
//       event-dash's status colour (--ds-ok, --ds-bad), and a fact grid event-dash's 12 px gap, as on dev.
import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

for (const name of ['event-bus', 'agent-workbench']) {
  test(`${name}: each summary card's icon and name share one centre line`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serveCharts(page, chartRows);
    await page.goto(`/${name}`);
    const rows = page.locator('.ev-root .kpi .k-l');
    await expect(rows.first()).toBeVisible();
    const measured = await rows.evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).checkVisibility()).map(node => {
      const icon = node.querySelector('svg');
      const text = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== '');
      if (!icon || !text) return { name: node.textContent!.trim(), icon: !!icon, text: !!text, offset: Number.NaN, gap: '' };
      const range = document.createRange(); range.selectNodeContents(text);
      const t = range.getBoundingClientRect(); const i = icon.getBoundingClientRect();
      return { name: text.textContent!.trim(), icon: true, text: true, offset: Math.abs((t.top + t.bottom) / 2 - (i.top + i.bottom) / 2), gap: getComputedStyle(node).columnGap };
    }));
    expect(measured.length).toBeGreaterThan(1);
    for (const row of measured) {
      expect(row.icon && row.text, JSON.stringify(row)).toBe(true);
      expect(row.offset, JSON.stringify(row)).toBeLessThanOrEqual(1);
      expect(row.gap, JSON.stringify(row)).toBe('7px');
    }
  });
}

for (const name of ['event-bus', 'delegation-evidence']) {
  test(`${name}: badges wear the status colours and fact grids keep a 12 px gap, as on dev`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serveCharts(page, chartRows);
    await page.goto(`/${name}`);
    await expect(page.locator('.ev-root .badge.ok').first()).toBeVisible();
    const measured = await page.evaluate(() => {
      const probe = document.createElement('span'); document.body.append(probe);
      const token = (name: string) => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
      const expected = { ok: token('--ds-ok'), bad: token('--ds-bad') };
      probe.remove();
      const colours = (selector: string) => [...document.querySelectorAll(selector)].filter(el => (el as HTMLElement).checkVisibility()).map(el => getComputedStyle(el).color);
      return { expected, ok: colours('.ev-root .badge.ok'), fail: colours('.ev-root .badge.fail'),
        gaps: [...document.querySelectorAll('.ev-root .kv')].filter(el => (el as HTMLElement).checkVisibility()).map(el => getComputedStyle(el).columnGap) };
    });
    expect(measured.ok.length).toBeGreaterThan(0);
    expect(new Set(measured.ok), JSON.stringify(measured)).toEqual(new Set([measured.expected.ok]));
    if (measured.fail.length) expect(new Set(measured.fail), JSON.stringify(measured)).toEqual(new Set([measured.expected.bad]));
    expect(measured.gaps.length).toBeGreaterThan(0);
    expect(new Set(measured.gaps), JSON.stringify(measured)).toEqual(new Set(['12px']));
  });
}

// @vitest-environment jsdom
// OMN-23330 AC12 (the operator's 2026-11-09 review of Settings): both provider tables in one table style, and the sticky
// section tabs never cover content when scrolled.
// Measured 2026-11-10 on the lab at 1440 px: with GET /models read, the providers are the provider list (one row per
// provider that opens to its details); with it unread, the same keys came as a different, generic table ("Provider key
// references"), so one page drew its providers two ways. A section tab is a "#access" link that no element carries as its
// id, so switching sections while scrolled kept the scroll and the new section opened with its top under the stuck tabs.
// This file holds the sticky half. The table-style half waits on the operator's reading of "both provider tables" (asked
// 2026-11-10): the provider list beside the revoked-key table, or the provider list beside the unread-list key table.
// Failure modes:
//   S3  switching sections while scrolled leaves the new section's top under the sticky tabs;
//   S4  switching sections when the new section is already in view scrolls the page anyway.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/pages/LocalDashboardPage', () => ({ LocalDashboardPage: ({ pageName }: { pageName: string }) => <p>{`embedded ${pageName}`}</p> }));
import { SettingsPage } from '@/pages/SettingsPage';

describe('OMN-23330 AC12: Settings draws providers one way and keeps sections clear of its tabs', () => {
  afterEach(() => { window.location.hash = ''; vi.restoreAllMocks(); });

  function layout(sectionTop: number) {
    const reveal = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('local-settings-menu')) return DOMRect.fromRect({ x: 256, y: 78, width: 1145, height: 56 });
      if (this.classList.contains('local-settings-section')) return DOMRect.fromRect({ x: 256, y: sectionTop, width: 1145, height: 600 });
      return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    });
    Element.prototype.scrollIntoView = reveal;
    render(<SettingsPage navigationCache={{} as never} />);
    return reveal;
  }

  it('S3: switching sections while scrolled brings the new section to just below the stuck tabs', () => {
    const reveal = layout(40); // the page is scrolled: the section's top is above the tabs' bottom (134)
    act(() => { window.location.hash = '#access'; fireEvent(window, new HashChangeEvent('hashchange')); });
    expect(reveal).toHaveBeenCalledTimes(1);
    const access = document.getElementById('settings-access')!;
    expect(reveal.mock.contexts[0]).toBe(access);
    // It lands below the tabs: its scroll margin is the tabs' height and a gap.
    expect(parseFloat(access.style.scrollMarginTop)).toBeGreaterThanOrEqual(56);
  });

  it('S4: switching sections with the new section already in view does not scroll', () => {
    const reveal = layout(150); // the section's top sits below the tabs' bottom (134)
    act(() => { window.location.hash = '#access'; fireEvent(window, new HashChangeEvent('hashchange')); });
    expect(screen.getByText('embedded api-keys')).toBeVisible();
    expect(reveal).not.toHaveBeenCalled();
  });
});

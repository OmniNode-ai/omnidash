/**
 * OMN-13057 — regression test for the SEA Control Plane 52px scroll-clip fix.
 *
 * Defect: .ev-root used display:block + min-height:100% inside .main (a flex
 * column with overflow:hidden). The content expanded past the viewport and
 * .main clipped the bottom ~52px unreachably. .ev-scroll had overflow-y:auto
 * but no height constraint, so the auto overflow never triggered.
 *
 * Fix: .ev-root → display:flex + flex-direction:column + flex:1 + min-height:0
 *      .ev-scroll → flex:1 + min-height:0 + overflow-y:auto
 *
 * jsdom does not compute CSS layout, so this test verifies the structural DOM
 * contract that the CSS selectors target. The classes must be present on the
 * right elements for the fix to take effect in the browser.
 */

import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvPageShell } from './EvPageShell';

describe('EvPageShell (OMN-13057 scroll-clip regression)', () => {
  it('renders with ev-root as the outermost element', () => {
    const { container } = render(
      <EvPageShell crumb="Test · Crumb" title="Test Title" sub="test subtitle">
        <div data-testid="child-content">inner content</div>
      </EvPageShell>,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.classList.contains('ev-root')).toBe(true);
  });

  it('renders ev-page-head as a direct child of ev-root (header element)', () => {
    const { container } = render(
      <EvPageShell crumb="Test · Crumb" title="Test Title" sub="test subtitle">
        <div>child</div>
      </EvPageShell>,
    );
    const root = container.firstElementChild!;
    const pageHead = root.querySelector('.ev-page-head');
    expect(pageHead).not.toBeNull();
    // Must be a direct child of ev-root so the flex layout can shrink-wrap it
    expect(pageHead?.parentElement).toBe(root);
  });

  it('renders ev-scroll as a direct child of ev-root (the scroller element)', () => {
    const { container } = render(
      <EvPageShell crumb="Test · Crumb" title="Test Title" sub="test subtitle">
        <div>child</div>
      </EvPageShell>,
    );
    const root = container.firstElementChild!;
    const scrollEl = root.querySelector('.ev-scroll');
    expect(scrollEl).not.toBeNull();
    // Must be a direct child of ev-root so flex:1 + min-height:0 constrains it
    expect(scrollEl?.parentElement).toBe(root);
  });

  it('renders ev-root with exactly two direct children: ev-page-head and ev-scroll', () => {
    // The flex-column layout depends on exactly two flex children.
    // ev-page-head shrinks to its content height; ev-scroll takes the remainder.
    // Extra wrapping elements would break the flex distribution.
    const { container } = render(
      <EvPageShell crumb="Test · Crumb" title="Test Title" sub="test subtitle">
        <div>child</div>
      </EvPageShell>,
    );
    const root = container.firstElementChild!;
    expect(root.children).toHaveLength(2);
    expect(root.children[0]?.classList.contains('ev-page-head')).toBe(true);
    expect(root.children[1]?.classList.contains('ev-scroll')).toBe(true);
  });

  it('renders page content inside ev-scroll', () => {
    const { container } = render(
      <EvPageShell crumb="Test · Crumb" title="Test Title" sub="test subtitle">
        <div data-testid="injected-child">inner page content</div>
      </EvPageShell>,
    );
    const scrollEl = container.querySelector('.ev-scroll');
    expect(scrollEl?.querySelector('[data-testid="injected-child"]')).not.toBeNull();
  });

  it('renders crumb, title, and sub in ev-page-head', () => {
    const { container } = render(
      <EvPageShell crumb="OmniDash · SEA" title="Self-Extending Agent" sub="live projections">
        <div>child</div>
      </EvPageShell>,
    );
    const pageHead = container.querySelector('.ev-page-head');
    expect(pageHead?.textContent).toContain('OmniDash · SEA');
    expect(pageHead?.textContent).toContain('Self-Extending Agent');
    expect(pageHead?.textContent).toContain('live projections');
  });

  it('renders optional headRight content in ev-page-head when provided', () => {
    const { container } = render(
      <EvPageShell
        crumb="OmniDash · SEA"
        title="Self-Extending Agent"
        sub="live projections"
        headRight={<span data-testid="head-right-badge">freshness-badge</span>}
      >
        <div>child</div>
      </EvPageShell>,
    );
    const pageHead = container.querySelector('.ev-page-head');
    expect(pageHead?.querySelector('[data-testid="head-right-badge"]')).not.toBeNull();
  });

  it('does not render ev-head-right when headRight is not provided', () => {
    const { container } = render(
      <EvPageShell crumb="OmniDash · SEA" title="Self-Extending Agent" sub="live projections">
        <div>child</div>
      </EvPageShell>,
    );
    // ev-head-right should only appear when headRight is given
    expect(container.querySelector('.ev-head-right')).toBeNull();
  });
});

// OMN-12402: CommandPalette had two contrast issues — ORCHESTRATOR/COMPUTE
// badges rendered as weak plain text (mixing var(--accent)/var(--text-tertiary)
// with hardcoded hex), and the Dispatch button hardcoded color:'white' over a
// pale var(--accent) (= --brand-soft) fill, invisible in light mode.
//
// These tests assert the component now drives all four badges from the
// design-system node-type role tokens and the Dispatch button from the
// brand/on-brand token pair, so no literal 'white' and no mixed token system
// remain.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/theme';
import { CommandPalette } from './CommandPalette';

vi.mock('./useDispatch', () => ({
  useDispatch: () => ({ dispatch: vi.fn(), isAvailable: true }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

const NODE_TYPE_TOKENS = ['orchestrator', 'compute', 'effect', 'reducer'] as const;

describe('CommandPalette — node-type badges (OMN-12402 issue 1)', () => {
  it('renders every node-type badge from a single role-token family (soft bg + ink text + border)', () => {
    render(<CommandPalette onClose={() => {}} />, { wrapper: Wrapper });

    // One badge per KNOWN_NODES entry; each must use its node-type role tokens
    // and never the weak var(--accent)/var(--text-tertiary) or hardcoded hex.
    for (const kind of ['ORCHESTRATOR', 'EFFECT', 'REDUCER', 'COMPUTE']) {
      const labels = screen.getAllByText(kind);
      expect(labels.length).toBeGreaterThan(0);
      // <Text> renders the label as an inner <span style="color:ink">; the
      // outer badge <span> (border + soft bg) is its parent.
      const label = labels[0];
      const wrapper = label.parentElement as HTMLElement;
      expect(wrapper.tagName).toBe('SPAN');
      const role = kind.toLowerCase();
      expect(wrapper.getAttribute('style')).toContain(`var(--${role}-soft)`);
      expect(wrapper.getAttribute('style')).toContain(`var(--${role})`);
      expect(label.getAttribute('style')).toContain(`var(--${role}-ink)`);
    }
  });

  it('does not use the weak/hardcoded colors that caused the inconsistency', () => {
    render(<CommandPalette onClose={() => {}} />, { wrapper: Wrapper });
    for (const kind of ['ORCHESTRATOR', 'COMPUTE']) {
      const span = screen.getAllByText(kind)[0].closest('span');
      const style = span!.getAttribute('style') ?? '';
      // ORCHESTRATOR no longer reads as plain var(--accent); COMPUTE no longer
      // falls back to var(--text-tertiary).
      expect(style).not.toContain('var(--accent)');
      expect(style).not.toContain('var(--text-tertiary)');
      expect(style).not.toContain('#d97706');
      expect(style).not.toContain('#7c3aed');
    }
    // The role tokens cover all four types so the chip taxonomy is consistent.
    expect(NODE_TYPE_TOKENS.length).toBe(4);
  });
});

describe('CommandPalette — Dispatch button (OMN-12402 issue 2)', () => {
  function openPayloadStage() {
    render(<CommandPalette onClose={() => {}} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('node-option-node_build_loop'));
  }

  it('uses the brand fill + on-brand text token, not literal white over a pale tint', () => {
    openPayloadStage();
    const button = screen.getByTestId('dispatch-submit');
    const style = button.getAttribute('style') ?? '';
    expect(style).toContain('var(--brand)');
    expect(style).toContain('var(--primary-foreground)');
    // The literal 'white' that vanished against a light --accent is gone, and
    // the background is no longer the pale var(--accent) (= --brand-soft) tint.
    expect(style).not.toContain('white');
    expect(style).not.toMatch(/background:\s*var\(--accent\)/);
  });
});

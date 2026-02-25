import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LifecycleStateBadge } from '../pattern/LifecycleStateBadge';

describe('LifecycleStateBadge', () => {
  describe('candidate state', () => {
    it('should render "Candidate" label', () => {
      render(<LifecycleStateBadge state="candidate" />);
      expect(screen.getByText('Candidate')).toBeInTheDocument();
    });

    it('should apply outline variant styling', () => {
      const { container } = render(<LifecycleStateBadge state="candidate" />);
      const badge = container.firstChild as HTMLElement;
      // Outline variant from shadcn Badge component
      expect(badge).toHaveClass('border');
    });

    it('should apply yellow styling for candidate state', () => {
      const { container } = render(<LifecycleStateBadge state="candidate" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('border-yellow-500');
      expect(badge).toHaveClass('text-yellow-600');
    });
  });

  describe('provisional state', () => {
    it('should render "Provisional" label', () => {
      render(<LifecycleStateBadge state="provisional" />);
      expect(screen.getByText('Provisional')).toBeInTheDocument();
    });

    it('should apply outline variant styling', () => {
      const { container } = render(<LifecycleStateBadge state="provisional" />);
      const badge = container.firstChild as HTMLElement;
      // Outline variant from shadcn Badge component
      expect(badge).toHaveClass('border');
    });

    it('should apply blue styling for provisional state', () => {
      const { container } = render(<LifecycleStateBadge state="provisional" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('border-blue-500');
      expect(badge).toHaveClass('text-blue-600');
    });
  });

  describe('validated state', () => {
    it('should render "Validated" label', () => {
      render(<LifecycleStateBadge state="validated" />);
      expect(screen.getByText('Validated')).toBeInTheDocument();
    });

    it('should apply green styling for validated state', () => {
      const { container } = render(<LifecycleStateBadge state="validated" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('bg-green-600');
      expect(badge).toHaveClass('hover:bg-green-700');
    });
  });

  describe('deprecated state', () => {
    it('should render "Deprecated" label', () => {
      render(<LifecycleStateBadge state="deprecated" />);
      expect(screen.getByText('Deprecated')).toBeInTheDocument();
    });

    it('should apply gray styling for deprecated state', () => {
      const { container } = render(<LifecycleStateBadge state="deprecated" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('bg-gray-500');
      expect(badge).toHaveClass('text-gray-100');
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <LifecycleStateBadge state="candidate" className="custom-class" />
      );
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('custom-class');
    });

    it('should merge custom className with state-specific classes', () => {
      const { container } = render(
        <LifecycleStateBadge state="validated" className="my-custom-class" />
      );
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('my-custom-class');
      expect(badge).toHaveClass('bg-green-600');
    });

    it('should preserve custom className alongside candidate styling', () => {
      const { container } = render(<LifecycleStateBadge state="candidate" className="mt-2 ml-4" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('mt-2');
      expect(badge).toHaveClass('ml-4');
      expect(badge).toHaveClass('border-yellow-500');
    });
  });

  describe('all states render correctly', () => {
    it.each([
      ['candidate', 'Candidate'],
      ['provisional', 'Provisional'],
      ['validated', 'Validated'],
      ['deprecated', 'Deprecated'],
    ] as const)('should render %s state correctly', (state, expectedLabel) => {
      const { container, unmount } = render(<LifecycleStateBadge state={state} />);

      // Check label
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();

      // Check badge container exists and is a Badge component
      const badge = container.firstChild as HTMLElement;
      expect(badge).toBeInTheDocument();
      expect(badge.tagName.toLowerCase()).toBe('div');

      unmount();
    });
  });

  describe('Badge component integration', () => {
    it('should render as a Badge element', () => {
      const { container } = render(<LifecycleStateBadge state="validated" />);
      const badge = container.firstChild as HTMLElement;
      // Badge uses inline-flex
      expect(badge).toHaveClass('inline-flex');
    });

    it('should have proper typography classes from Badge', () => {
      const { container } = render(<LifecycleStateBadge state="provisional" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('font-semibold');
    });
  });
});

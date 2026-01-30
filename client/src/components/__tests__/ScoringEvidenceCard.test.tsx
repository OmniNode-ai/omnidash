import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScoringEvidenceCard } from '../pattern/ScoringEvidenceCard';

describe('ScoringEvidenceCard', () => {
  describe('Rendering', () => {
    it('should render title and score percentage correctly', () => {
      render(
        <ScoringEvidenceCard title="Test Score" score={0.85}>
          <p>Test content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('Test Score')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('should render with integer score percentages', () => {
      render(
        <ScoringEvidenceCard title="Exact Score" score={0.5}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should round decimal scores correctly', () => {
      render(
        <ScoringEvidenceCard title="Decimal Score" score={0.456}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      // 45.6 rounds to 46
      expect(screen.getByText('46%')).toBeInTheDocument();
    });

    it('should handle zero score', () => {
      render(
        <ScoringEvidenceCard title="Zero Score" score={0}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should handle full score', () => {
      render(
        <ScoringEvidenceCard title="Full Score" score={1}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Score Color Coding', () => {
    it('should show green styling for high score (>=0.7)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="High Score" score={0.7}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      // Check text color
      const scoreText = screen.getByText('70%');
      expect(scoreText).toHaveClass('text-green-600');

      // Check progress bar color
      const progressBar = container.querySelector('.bg-green-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show green styling for score above threshold (0.85)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Very High Score" score={0.85}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('85%');
      expect(scoreText).toHaveClass('text-green-600');

      const progressBar = container.querySelector('.bg-green-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show yellow styling for moderate score (>=0.4, <0.7)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Moderate Score" score={0.55}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('55%');
      expect(scoreText).toHaveClass('text-yellow-600');

      const progressBar = container.querySelector('.bg-yellow-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show yellow styling at lower moderate boundary (0.4)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Boundary Score" score={0.4}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('40%');
      expect(scoreText).toHaveClass('text-yellow-600');

      const progressBar = container.querySelector('.bg-yellow-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show yellow styling just below good threshold (0.69)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Just Below Good" score={0.69}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('69%');
      expect(scoreText).toHaveClass('text-yellow-600');

      const progressBar = container.querySelector('.bg-yellow-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show red styling for low score (<0.4)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Low Score" score={0.25}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('25%');
      expect(scoreText).toHaveClass('text-red-600');

      const progressBar = container.querySelector('.bg-red-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show red styling just below moderate threshold (0.39)', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Just Below Moderate" score={0.39}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('39%');
      expect(scoreText).toHaveClass('text-red-600');

      const progressBar = container.querySelector('.bg-red-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show red styling for zero score', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Zero" score={0}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const scoreText = screen.getByText('0%');
      expect(scoreText).toHaveClass('text-red-600');

      const progressBar = container.querySelector('.bg-red-600');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('should set progress bar width to match score percentage', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Progress Test" score={0.75}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const progressBar = container.querySelector('.bg-green-600');
      expect(progressBar).toHaveStyle({ width: '75%' });
    });

    it('should handle 0% width correctly', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Zero Width" score={0}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const progressBar = container.querySelector('.bg-red-600');
      expect(progressBar).toHaveStyle({ width: '0%' });
    });

    it('should handle 100% width correctly', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Full Width" score={1}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const progressBar = container.querySelector('.bg-green-600');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });

    it('should calculate exact width for decimal scores', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Decimal Width" score={0.25}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const progressBar = container.querySelector('.bg-red-600');
      expect(progressBar).toHaveStyle({ width: '25%' });
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should start collapsed by default', () => {
      render(
        <ScoringEvidenceCard title="Collapsed Test" score={0.8}>
          <p>Hidden content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    });

    it('should expand when header is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Click Test" score={0.8}>
          <p>Expandable content</p>
        </ScoringEvidenceCard>
      );

      // Content should not be visible initially
      expect(screen.queryByText('Expandable content')).not.toBeInTheDocument();

      // Click the header to expand
      const header = screen.getByText('Click Test').closest('[class*="cursor-pointer"]');
      await user.click(header!);

      // Content should now be visible
      expect(screen.getByText('Expandable content')).toBeInTheDocument();
    });

    it('should collapse when header is clicked again', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Toggle Test" score={0.8}>
          <p>Toggle content</p>
        </ScoringEvidenceCard>
      );

      const header = screen.getByText('Toggle Test').closest('[class*="cursor-pointer"]');

      // Click to expand
      await user.click(header!);
      expect(screen.getByText('Toggle content')).toBeInTheDocument();

      // Click to collapse
      await user.click(header!);
      expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();
    });

    it('should toggle multiple times correctly', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Multi Toggle" score={0.5}>
          <p>Multi toggle content</p>
        </ScoringEvidenceCard>
      );

      const header = screen.getByText('Multi Toggle').closest('[class*="cursor-pointer"]');

      // First toggle: expand
      await user.click(header!);
      expect(screen.getByText('Multi toggle content')).toBeInTheDocument();

      // Second toggle: collapse
      await user.click(header!);
      expect(screen.queryByText('Multi toggle content')).not.toBeInTheDocument();

      // Third toggle: expand again
      await user.click(header!);
      expect(screen.getByText('Multi toggle content')).toBeInTheDocument();
    });
  });

  describe('defaultExpanded Prop', () => {
    it('should start expanded when defaultExpanded is true', () => {
      render(
        <ScoringEvidenceCard title="Default Expanded" score={0.6} defaultExpanded>
          <p>Initially visible content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('Initially visible content')).toBeInTheDocument();
    });

    it('should start collapsed when defaultExpanded is false', () => {
      render(
        <ScoringEvidenceCard title="Default Collapsed" score={0.6} defaultExpanded={false}>
          <p>Initially hidden content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.queryByText('Initially hidden content')).not.toBeInTheDocument();
    });

    it('should still be collapsible when started expanded', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Collapsible Expanded" score={0.6} defaultExpanded>
          <p>Content to collapse</p>
        </ScoringEvidenceCard>
      );

      // Content visible initially
      expect(screen.getByText('Content to collapse')).toBeInTheDocument();

      // Click to collapse
      const header = screen.getByText('Collapsible Expanded').closest('[class*="cursor-pointer"]');
      await user.click(header!);

      // Content should be hidden
      expect(screen.queryByText('Content to collapse')).not.toBeInTheDocument();
    });
  });

  describe('Children Content', () => {
    it('should render children content when expanded', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Children Test" score={0.8}>
          <div data-testid="child-content">
            <span>Child element 1</span>
            <span>Child element 2</span>
          </div>
        </ScoringEvidenceCard>
      );

      const header = screen.getByText('Children Test').closest('[class*="cursor-pointer"]');
      await user.click(header!);

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Child element 1')).toBeInTheDocument();
      expect(screen.getByText('Child element 2')).toBeInTheDocument();
    });

    it('should render complex children content', async () => {
      const user = userEvent.setup();

      render(
        <ScoringEvidenceCard title="Complex Children" score={0.9}>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
        </ScoringEvidenceCard>
      );

      const header = screen.getByText('Complex Children').closest('[class*="cursor-pointer"]');
      await user.click(header!);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });
  });

  describe('Chevron Icon', () => {
    it('should show right chevron when collapsed', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Chevron Test" score={0.5}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      // ChevronRight icon should be present (Lucide renders as svg)
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should show down chevron when expanded', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <ScoringEvidenceCard title="Expanded Chevron" score={0.5}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      const header = screen.getByText('Expanded Chevron').closest('[class*="cursor-pointer"]');
      await user.click(header!);

      // ChevronDown icon should be present after expansion
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle score slightly above threshold boundaries', () => {
      const { container: containerGood } = render(
        <ScoringEvidenceCard title="Just Good" score={0.701}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );
      expect(containerGood.querySelector('.bg-green-600')).toBeInTheDocument();

      const { container: containerModerate } = render(
        <ScoringEvidenceCard title="Just Moderate" score={0.401}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );
      expect(containerModerate.querySelector('.bg-yellow-600')).toBeInTheDocument();
    });

    it('should handle very small scores', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Tiny Score" score={0.01}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('1%')).toBeInTheDocument();
      expect(container.querySelector('.bg-red-600')).toBeInTheDocument();
    });

    it('should handle score of 0.99', () => {
      const { container } = render(
        <ScoringEvidenceCard title="Almost Full" score={0.99}>
          <p>Content</p>
        </ScoringEvidenceCard>
      );

      expect(screen.getByText('99%')).toBeInTheDocument();
      expect(container.querySelector('.bg-green-600')).toBeInTheDocument();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  SystemHealthBadge,
  calculateHealthLevel,
  getHealthTooltip,
  type HealthLevel,
} from '../SystemHealthBadge';

describe('calculateHealthLevel', () => {
  describe('critical status', () => {
    it('should return critical when failed_nodes > 0', () => {
      const result = calculateHealthLevel({
        failed_nodes: 1,
        pending_nodes: 0,
      });
      expect(result).toBe('critical');
    });

    it('should return critical when by_health.critical > 0', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { critical: 2 },
      });
      expect(result).toBe('critical');
    });

    it('should return critical when both failed_nodes and by_health.critical exist', () => {
      const result = calculateHealthLevel({
        failed_nodes: 1,
        pending_nodes: 0,
        by_health: { critical: 3 },
      });
      expect(result).toBe('critical');
    });

    it('should prioritize critical over warning conditions', () => {
      const result = calculateHealthLevel({
        failed_nodes: 1,
        pending_nodes: 5,
        by_health: { critical: 1, warning: 10 },
      });
      expect(result).toBe('critical');
    });
  });

  describe('warning status', () => {
    it('should return warning when pending_nodes > 0 (no critical)', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 2,
      });
      expect(result).toBe('warning');
    });

    it('should return warning when by_health.warning > 0 (no critical)', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { warning: 3 },
      });
      expect(result).toBe('warning');
    });

    it('should return warning when both pending_nodes and by_health.warning exist', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 1,
        by_health: { warning: 2 },
      });
      expect(result).toBe('warning');
    });
  });

  describe('healthy status', () => {
    it('should return healthy when no issues', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
      });
      expect(result).toBe('healthy');
    });

    it('should return healthy when by_health exists but all values are zero', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { critical: 0, warning: 0 },
      });
      expect(result).toBe('healthy');
    });

    it('should return healthy when by_health is empty object', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: {},
      });
      expect(result).toBe('healthy');
    });
  });

  describe('graceful handling of missing/undefined properties', () => {
    it('should handle missing by_health property', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
      });
      expect(result).toBe('healthy');
    });

    it('should handle undefined by_health.critical', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { warning: 0 },
      });
      expect(result).toBe('healthy');
    });

    it('should handle undefined by_health.warning', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { critical: 0 },
      });
      expect(result).toBe('healthy');
    });

    it('should handle partially defined by_health with warning value', () => {
      const result = calculateHealthLevel({
        failed_nodes: 0,
        pending_nodes: 0,
        by_health: { warning: 5 },
      });
      expect(result).toBe('warning');
    });
  });
});

describe('getHealthTooltip', () => {
  const baseData = {
    total_nodes: 10,
    active_nodes: 8,
    failed_nodes: 0,
    pending_nodes: 0,
    by_health: {
      passing: 8,
      warning: 0,
      critical: 0,
    },
  };

  describe('critical status tooltip', () => {
    it('should show failed nodes count for critical status', () => {
      const data = { ...baseData, failed_nodes: 2 };
      const result = getHealthTooltip(data, 'critical');
      expect(result).toBe('2 failed nodes');
    });

    it('should show critical instances count for critical status', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, critical: 3 } };
      const result = getHealthTooltip(data, 'critical');
      expect(result).toBe('3 critical instances');
    });

    it('should show both failed nodes and critical instances', () => {
      const data = {
        ...baseData,
        failed_nodes: 1,
        by_health: { ...baseData.by_health, critical: 2 },
      };
      const result = getHealthTooltip(data, 'critical');
      expect(result).toBe('1 failed node, 2 critical instances');
    });

    it('should use singular form for 1 failed node', () => {
      const data = { ...baseData, failed_nodes: 1 };
      const result = getHealthTooltip(data, 'critical');
      expect(result).toContain('1 failed node');
      expect(result).not.toContain('nodes');
    });

    it('should use singular form for 1 critical instance', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, critical: 1 } };
      const result = getHealthTooltip(data, 'critical');
      expect(result).toContain('1 critical instance');
      expect(result).not.toContain('instances');
    });
  });

  describe('warning status tooltip', () => {
    it('should show pending nodes count for warning status', () => {
      const data = { ...baseData, pending_nodes: 3 };
      const result = getHealthTooltip(data, 'warning');
      expect(result).toBe('3 pending nodes');
    });

    it('should show warning instances count for warning status', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, warning: 4 } };
      const result = getHealthTooltip(data, 'warning');
      expect(result).toBe('4 warning instances');
    });

    it('should show both pending nodes and warning instances', () => {
      const data = {
        ...baseData,
        pending_nodes: 2,
        by_health: { ...baseData.by_health, warning: 3 },
      };
      const result = getHealthTooltip(data, 'warning');
      expect(result).toBe('2 pending nodes, 3 warning instances');
    });

    it('should use singular form for 1 pending node', () => {
      const data = { ...baseData, pending_nodes: 1 };
      const result = getHealthTooltip(data, 'warning');
      expect(result).toContain('1 pending node');
      expect(result).not.toContain('nodes');
    });

    it('should use singular form for 1 warning instance', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, warning: 1 } };
      const result = getHealthTooltip(data, 'warning');
      expect(result).toContain('1 warning instance');
      expect(result).not.toContain('instances');
    });
  });

  describe('healthy status tooltip', () => {
    it('should show active/total nodes for healthy status', () => {
      const result = getHealthTooltip(baseData, 'healthy');
      expect(result).toContain('8 of 10 nodes active');
    });

    it('should show passing instances count for healthy status', () => {
      const result = getHealthTooltip(baseData, 'healthy');
      expect(result).toContain('8 instances passing');
    });

    it('should use singular form for 1 instance passing', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, passing: 1 } };
      const result = getHealthTooltip(data, 'healthy');
      expect(result).toContain('1 instance passing');
      expect(result).not.toContain('instances');
    });

    it('should not show passing instances if none', () => {
      const data = { ...baseData, by_health: { ...baseData.by_health, passing: 0 } };
      const result = getHealthTooltip(data, 'healthy');
      expect(result).toBe('8 of 10 nodes active');
      expect(result).not.toContain('passing');
    });
  });
});

describe('SystemHealthBadge component', () => {
  describe('rendering correct labels', () => {
    it('should render HEALTHY label for healthy status', () => {
      render(<SystemHealthBadge status="healthy" />);
      expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    });

    it('should render WARNING label for warning status', () => {
      render(<SystemHealthBadge status="warning" />);
      expect(screen.getByText('WARNING')).toBeInTheDocument();
    });

    it('should render CRITICAL label for critical status', () => {
      render(<SystemHealthBadge status="critical" />);
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  describe('rendering correct icons', () => {
    it('should render CheckCircle2 icon for healthy status', () => {
      const { container } = render(<SystemHealthBadge status="healthy" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // CheckCircle2 icon should have emerald color class
      expect(svg).toHaveClass('text-emerald-500');
    });

    it('should render AlertTriangle icon for warning status', () => {
      const { container } = render(<SystemHealthBadge status="warning" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // AlertTriangle icon should have amber color class
      expect(svg).toHaveClass('text-amber-500');
    });

    it('should render XCircle icon for critical status', () => {
      const { container } = render(<SystemHealthBadge status="critical" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // XCircle icon should have red color class
      expect(svg).toHaveClass('text-red-500');
    });
  });

  describe('applying correct CSS classes', () => {
    it('should apply emerald colors for healthy status', () => {
      const { container } = render(<SystemHealthBadge status="healthy" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('bg-emerald-500/15');
      expect(badge).toHaveClass('border-emerald-500/30');
    });

    it('should apply amber colors for warning status', () => {
      const { container } = render(<SystemHealthBadge status="warning" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('bg-amber-500/15');
      expect(badge).toHaveClass('border-amber-500/30');
    });

    it('should apply red colors for critical status', () => {
      const { container } = render(<SystemHealthBadge status="critical" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('bg-red-500/15');
      expect(badge).toHaveClass('border-red-500/30');
    });

    it('should apply base styling classes', () => {
      const { container } = render(<SystemHealthBadge status="healthy" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('rounded-md');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('font-semibold');
    });
  });

  describe('size variants', () => {
    it('should apply medium size classes by default', () => {
      const { container } = render(<SystemHealthBadge status="healthy" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('py-1');
      expect(badge).toHaveClass('text-sm');
    });

    it('should apply small size classes when size="sm"', () => {
      const { container } = render(<SystemHealthBadge status="healthy" size="sm" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-xs');
    });

    it('should apply larger icon for medium size', () => {
      const { container } = render(<SystemHealthBadge status="healthy" size="md" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('h-3.5');
      expect(svg).toHaveClass('w-3.5');
    });

    it('should apply smaller icon for small size', () => {
      const { container } = render(<SystemHealthBadge status="healthy" size="sm" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('h-3');
      expect(svg).toHaveClass('w-3');
    });
  });

  describe('title/tooltip', () => {
    it('should apply title attribute when provided', () => {
      const { container } = render(
        <SystemHealthBadge status="warning" title="2 instances in warning state" />
      );
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveAttribute('title', '2 instances in warning state');
    });

    it('should not have title attribute when not provided', () => {
      const { container } = render(<SystemHealthBadge status="healthy" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).not.toHaveAttribute('title');
    });
  });

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<SystemHealthBadge status="healthy" className="custom-class" />);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      const { container } = render(
        <SystemHealthBadge status="healthy" className="my-custom-class" />
      );
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveClass('my-custom-class');
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('bg-emerald-500/15');
    });
  });

  describe('all statuses render correctly', () => {
    const statuses: HealthLevel[] = ['healthy', 'warning', 'critical'];
    const expectedLabels = {
      healthy: 'HEALTHY',
      warning: 'WARNING',
      critical: 'CRITICAL',
    };

    statuses.forEach((status) => {
      it(`should render ${status} status correctly`, () => {
        const { container, unmount } = render(<SystemHealthBadge status={status} />);

        // Check label
        expect(screen.getByText(expectedLabels[status])).toBeInTheDocument();

        // Check icon exists
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();

        // Check badge container exists
        const badge = container.firstChild as HTMLElement;
        expect(badge).toHaveClass('inline-flex');

        unmount();
      });
    });
  });
});

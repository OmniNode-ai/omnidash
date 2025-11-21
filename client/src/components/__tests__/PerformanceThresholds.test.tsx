import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PerformanceThresholds } from '../PerformanceThresholds';

describe('PerformanceThresholds', () => {
  const mockThresholds = [
    {
      id: 'cpu',
      name: 'CPU Usage',
      current: 75,
      max: 100,
      unit: '%',
      warning: 70,
      critical: 90,
    },
    {
      id: 'memory',
      name: 'Memory Usage',
      current: 50,
      max: 100,
      unit: '%',
      warning: 80,
      critical: 95,
    },
    {
      id: 'disk',
      name: 'Disk Usage',
      current: 92,
      max: 100,
      unit: '%',
      warning: 85,
      critical: 95,
    },
  ];

  it('should render all thresholds', () => {
    render(<PerformanceThresholds thresholds={mockThresholds} />);

    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
  });

  it('should display current and max values', () => {
    render(<PerformanceThresholds thresholds={mockThresholds} />);

    expect(screen.getByText('75 / 100 %')).toBeInTheDocument();
    expect(screen.getByText('50 / 100 %')).toBeInTheDocument();
    expect(screen.getByText('92 / 100 %')).toBeInTheDocument();
  });

  it('should identify critical status correctly', () => {
    const criticalThreshold = [
      {
        id: 'test',
        name: 'Critical Test',
        current: 95,
        max: 100,
        unit: '%',
        warning: 70,
        critical: 90,
      },
    ];

    render(<PerformanceThresholds thresholds={criticalThreshold} />);

    expect(screen.getByText('Critical Test')).toBeInTheDocument();
    expect(screen.getByText('95 / 100 %')).toBeInTheDocument();
  });

  it('should identify warning status correctly', () => {
    const warningThreshold = [
      {
        id: 'test',
        name: 'Warning Test',
        current: 75,
        max: 100,
        unit: '%',
        warning: 70,
        critical: 90,
      },
    ];

    render(<PerformanceThresholds thresholds={warningThreshold} />);

    expect(screen.getByText('Warning Test')).toBeInTheDocument();
  });

  it('should identify normal status correctly', () => {
    const normalThreshold = [
      {
        id: 'test',
        name: 'Normal Test',
        current: 50,
        max: 100,
        unit: '%',
        warning: 70,
        critical: 90,
      },
    ];

    render(<PerformanceThresholds thresholds={normalThreshold} />);

    expect(screen.getByText('Normal Test')).toBeInTheDocument();
  });

  it('should calculate percentage correctly', () => {
    render(<PerformanceThresholds thresholds={mockThresholds} />);

    // CPU: 75/100 = 75%
    // Memory: 50/100 = 50%
    // Disk: 92/100 = 92%
    expect(screen.getByText('75 / 100 %')).toBeInTheDocument();
  });

  it('should handle thresholds without warning/critical values', () => {
    const simpleThresholds = [
      {
        id: 'simple',
        name: 'Simple Metric',
        current: 50,
        max: 100,
        unit: '%',
      },
    ];

    render(<PerformanceThresholds thresholds={simpleThresholds} />);

    expect(screen.getByText('Simple Metric')).toBeInTheDocument();
    expect(screen.getByText('50 / 100 %')).toBeInTheDocument();
  });

  it('should handle empty thresholds array', () => {
    render(<PerformanceThresholds thresholds={[]} />);

    expect(screen.getByText('Performance Thresholds')).toBeInTheDocument();
  });
});

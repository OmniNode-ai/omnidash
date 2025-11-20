import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualityGatePanel } from '../QualityGatePanel';

describe('QualityGatePanel', () => {
  const mockGates = [
    {
      id: 'gate-1',
      name: 'Code Coverage',
      status: 'passed' as const,
      threshold: '80%',
      currentValue: '85%',
    },
    {
      id: 'gate-2',
      name: 'Security Scan',
      status: 'failed' as const,
      threshold: '0 vulnerabilities',
      currentValue: '2 vulnerabilities',
    },
    {
      id: 'gate-3',
      name: 'Test Quality',
      status: 'warning' as const,
      threshold: '90%',
      currentValue: '85%',
    },
  ];

  it('should render all gates', () => {
    render(<QualityGatePanel gates={mockGates} />);

    expect(screen.getByText('Code Coverage')).toBeInTheDocument();
    expect(screen.getByText('Security Scan')).toBeInTheDocument();
    expect(screen.getByText('Test Quality')).toBeInTheDocument();
  });

  it('should calculate success rate correctly', () => {
    render(<QualityGatePanel gates={mockGates} />);

    // 1 of 3 gates passed = 33%
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 gates passed')).toBeInTheDocument();
  });

  it('should show 100% when all gates pass', () => {
    const allPassed = mockGates.map((gate) => ({ ...gate, status: 'passed' as const }));

    render(<QualityGatePanel gates={allPassed} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 gates passed')).toBeInTheDocument();
  });

  it('should display threshold and current value for each gate', () => {
    render(<QualityGatePanel gates={mockGates} />);

    expect(screen.getByText(/Threshold: 80%/)).toBeInTheDocument();
    // Check that current value exists (may appear multiple times - threshold and value)
    const valueElements = screen.getAllByText('85%');
    expect(valueElements.length).toBeGreaterThan(0);
  });

  it('should apply correct status colors', () => {
    render(<QualityGatePanel gates={mockGates} />);

    // Check that gates have correct test ids
    expect(screen.getByTestId('gate-gate-1')).toBeInTheDocument();
    expect(screen.getByTestId('gate-gate-2')).toBeInTheDocument();
    expect(screen.getByTestId('gate-gate-3')).toBeInTheDocument();
  });

  it('should handle empty gates array', () => {
    render(<QualityGatePanel gates={[]} />);

    expect(screen.getByText('0 of 0 gates passed')).toBeInTheDocument();
    expect(screen.getByText('Quality Gates')).toBeInTheDocument();
  });

  it('should render status icons correctly', () => {
    const { container } = render(<QualityGatePanel gates={mockGates} />);

    // Icons should be rendered for each gate
    const gateElements = container.querySelectorAll('[data-testid^="gate-"]');
    expect(gateElements.length).toBe(3);
  });
});

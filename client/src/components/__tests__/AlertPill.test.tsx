import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { AlertPill } from '../AlertPill';

describe('AlertPill', () => {
  it('should render with message', () => {
    render(<AlertPill level="info" message="Test alert message" />);

    expect(screen.getByText('Test alert message')).toBeInTheDocument();
  });

  it('should render with critical level', () => {
    render(<AlertPill level="critical" message="Critical alert" />);

    expect(screen.getByText('Critical alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should render with warning level', () => {
    render(<AlertPill level="warning" message="Warning alert" />);

    expect(screen.getByText('Warning alert')).toBeInTheDocument();
  });

  it('should render with info level', () => {
    render(<AlertPill level="info" message="Info alert" />);

    expect(screen.getByText('Info alert')).toBeInTheDocument();
  });

  it('should call onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const handleDismiss = vi.fn();

    render(<AlertPill level="info" message="Dismissible alert" onDismiss={handleDismiss} />);

    const dismissButton = screen.getByLabelText('Dismiss alert');
    await user.click(dismissButton);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('should not render dismiss button when onDismiss is not provided', () => {
    render(<AlertPill level="info" message="Non-dismissible alert" />);

    expect(screen.queryByLabelText('Dismiss alert')).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<AlertPill level="info" message="Custom class alert" className="custom-alert-class" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('custom-alert-class');
  });

  it('should have aria-live attribute', () => {
    render(<AlertPill level="warning" message="Aria alert" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('should truncate long messages', () => {
    const longMessage = 'A'.repeat(500);

    render(<AlertPill level="info" message={longMessage} />);

    const messageSpan = screen.getByText(longMessage);
    expect(messageSpan).toHaveClass('truncate');
    expect(messageSpan).toHaveClass('max-w-[400px]');
  });
});

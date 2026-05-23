import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';

function BoomWidget(): never {
  throw new Error('boom — intentional crash');
}

function SafeWidget() {
  return <div>safe content</div>;
}

describe('WidgetErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <WidgetErrorBoundary componentName="safe-widget">
        <SafeWidget />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('shows error fallback when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <WidgetErrorBoundary componentName="boom-widget">
        <BoomWidget />
      </WidgetErrorBoundary>,
    );
    expect(screen.getByTestId('widget-error-boundary')).toBeInTheDocument();
    expect(screen.getByText('This widget failed to load')).toBeInTheDocument();
    expect(screen.getByText('boom — intentional crash')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows Remove button when onRemove is provided and error occurs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRemove = vi.fn();
    render(
      <WidgetErrorBoundary componentName="boom-widget" onRemove={onRemove}>
        <BoomWidget />
      </WidgetErrorBoundary>,
    );
    const removeBtn = screen.getByRole('button', { name: /remove from layout/i });
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not show Remove button when onRemove is not provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <WidgetErrorBoundary componentName="boom-widget">
        <BoomWidget />
      </WidgetErrorBoundary>,
    );
    expect(screen.queryByRole('button', { name: /remove from layout/i })).not.toBeInTheDocument();
    spy.mockRestore();
  });
});

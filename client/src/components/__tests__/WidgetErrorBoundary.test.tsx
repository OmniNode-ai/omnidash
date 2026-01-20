import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { WidgetErrorBoundary } from '../WidgetErrorBoundary';

// Component that throws an error
function ThrowingWidget({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Widget rendering failed');
  }
  return <div>Widget content</div>;
}

// Suppress console.error during tests since we expect errors
const originalError = console.error;

describe('WidgetErrorBoundary', () => {
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });
  it('should render children when there is no error', () => {
    render(
      <WidgetErrorBoundary widgetId="widget-1" title="Test Widget">
        <div>Widget content</div>
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Widget content')).toBeInTheDocument();
  });

  it('should render error state with widget title when child throws', () => {
    render(
      <WidgetErrorBoundary widgetId="widget-1" title="My Widget">
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('My Widget Error')).toBeInTheDocument();
    expect(screen.getByText('Widget rendering failed')).toBeInTheDocument();
  });

  it('should display widget ID in error state', () => {
    render(
      <WidgetErrorBoundary widgetId="unique-widget-123" title="Test">
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('unique-widget-123')).toBeInTheDocument();
  });

  it('should show generic title when title prop is not provided', () => {
    render(
      <WidgetErrorBoundary widgetId="widget-1">
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Widget Error')).toBeInTheDocument();
  });

  it('should call onError callback with widget ID', () => {
    const onError = vi.fn();

    render(
      <WidgetErrorBoundary widgetId="widget-456" title="Test" onError={onError}>
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Widget rendering failed' }),
      expect.any(Object),
      'widget-456'
    );
  });

  it('should have retry button that resets error state', () => {
    render(
      <WidgetErrorBoundary widgetId="widget-1" title="Test">
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('should log error with widget identifier', () => {
    render(
      <WidgetErrorBoundary widgetId="widget-789" title="My Widget">
        <ThrowingWidget shouldThrow={true} />
      </WidgetErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('widget-789'),
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('should show default error message when error has no message', () => {
    function ThrowEmptyError(): React.ReactElement {
      throw new Error();
    }

    render(
      <WidgetErrorBoundary widgetId="widget-1">
        <ThrowEmptyError />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Failed to render widget')).toBeInTheDocument();
  });

  it('should be usable in a grid layout', () => {
    const { container } = render(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        <WidgetErrorBoundary widgetId="widget-1" title="Widget 1">
          <div>Content 1</div>
        </WidgetErrorBoundary>
        <WidgetErrorBoundary widgetId="widget-2" title="Widget 2">
          <ThrowingWidget shouldThrow={true} />
        </WidgetErrorBoundary>
      </div>
    );

    // First widget should render normally
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    // Second widget should show error state
    expect(screen.getByText('Widget 2 Error')).toBeInTheDocument();
    // Grid container should have both children
    expect(container.querySelector('[style*="grid"]')?.children.length).toBe(2);
  });

  it('should isolate errors between multiple widgets', () => {
    render(
      <>
        <WidgetErrorBoundary widgetId="widget-1" title="Widget 1">
          <div>Healthy widget</div>
        </WidgetErrorBoundary>
        <WidgetErrorBoundary widgetId="widget-2" title="Widget 2">
          <ThrowingWidget shouldThrow={true} />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary widgetId="widget-3" title="Widget 3">
          <div>Another healthy widget</div>
        </WidgetErrorBoundary>
      </>
    );

    // Healthy widgets should render normally
    expect(screen.getByText('Healthy widget')).toBeInTheDocument();
    expect(screen.getByText('Another healthy widget')).toBeInTheDocument();
    // Only the failing widget should show error
    expect(screen.getByText('Widget 2 Error')).toBeInTheDocument();
  });
});

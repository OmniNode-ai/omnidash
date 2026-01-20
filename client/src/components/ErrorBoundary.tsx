/**
 * ErrorBoundary
 *
 * Generic React error boundary component that catches JavaScript errors
 * in child component tree and displays a fallback UI.
 *
 * @module components/ErrorBoundary
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Props for the ErrorBoundary component.
 *
 * @interface Props
 */
interface Props {
  /**
   * Child components to render. If any child throws an error during rendering,
   * the error boundary will catch it and display the fallback UI.
   */
  children: ReactNode;

  /**
   * Optional custom fallback UI to display when an error is caught.
   * If not provided, a default error card with retry button is shown.
   */
  fallback?: ReactNode;

  /**
   * Optional callback invoked when an error is caught.
   * Useful for logging errors to an external service.
   *
   * @param error - The error that was thrown
   * @param errorInfo - React error info containing the component stack trace
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * Internal state for the ErrorBoundary component.
 *
 * @interface State
 */
interface State {
  /** Whether an error has been caught */
  hasError: boolean;

  /** The caught error, or null if no error has occurred */
  error: Error | null;
}

/**
 * A React error boundary that catches JavaScript errors in its child component tree.
 *
 * Error boundaries catch errors during rendering, in lifecycle methods, and in
 * constructors of the whole tree below them. They do NOT catch errors for:
 * - Event handlers
 * - Asynchronous code (e.g., setTimeout or requestAnimationFrame callbacks)
 * - Server-side rendering
 * - Errors thrown in the error boundary itself
 *
 * @example
 * ```tsx
 * // Basic usage with default fallback
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With custom fallback
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With error logging
 * <ErrorBoundary onError={(error, info) => logToService(error, info)}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @extends Component<Props, State>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="p-4 border-destructive/50 bg-destructive/10">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Something went wrong</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="h-3 w-3 mr-2" />
            Retry
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}

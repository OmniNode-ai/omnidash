/**
 * WidgetErrorBoundary
 *
 * Specialized error boundary for dashboard widgets.
 * Provides a compact error display suitable for grid layouts
 * and includes widget identification in error reporting.
 *
 * @module components/WidgetErrorBoundary
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Props for the WidgetErrorBoundary component.
 *
 * @interface Props
 */
interface Props {
  /**
   * Child widget components to render. If the widget throws an error,
   * a compact error card will be displayed in its place.
   */
  children: ReactNode;

  /**
   * Unique identifier for the widget. Used for error tracking and
   * displayed in the error UI for debugging purposes.
   */
  widgetId: string;

  /**
   * Optional human-readable title for the widget.
   * Displayed in the error message to help identify which widget failed.
   */
  title?: string;

  /**
   * Optional callback invoked when a widget error is caught.
   * Receives the widget ID in addition to the standard error information.
   *
   * @param error - The error that was thrown
   * @param errorInfo - React error info containing the component stack trace
   * @param widgetId - The unique identifier of the failing widget
   */
  onError?: (error: Error, errorInfo: ErrorInfo, widgetId: string) => void;
}

/**
 * Internal state for the WidgetErrorBoundary component.
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
 * A specialized error boundary designed for dashboard widgets.
 *
 * Unlike the generic ErrorBoundary, this component:
 * - Displays a compact error UI suitable for grid layouts
 * - Shows the widget ID for debugging
 * - Includes the widget ID in error callbacks for tracking
 * - Uses smaller typography and padding to fit within widget cells
 *
 * Each widget in a dashboard should be wrapped in its own WidgetErrorBoundary
 * to isolate failures and prevent one broken widget from crashing the entire dashboard.
 *
 * @example
 * ```tsx
 * // Basic usage in a dashboard grid
 * <WidgetErrorBoundary widgetId="metrics-cpu" title="CPU Usage">
 *   <MetricCardWidget {...props} />
 * </WidgetErrorBoundary>
 *
 * // With error tracking
 * <WidgetErrorBoundary
 *   widgetId="chart-memory"
 *   title="Memory Chart"
 *   onError={(error, info, id) => {
 *     trackWidgetError(id, error);
 *   }}
 * >
 *   <ChartWidget {...props} />
 * </WidgetErrorBoundary>
 * ```
 *
 * @extends Component<Props, State>
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { widgetId, title } = this.props;
    console.error(`Widget error [${widgetId}${title ? ` - ${title}` : ''}]:`, error, errorInfo);
    this.props.onError?.(error, errorInfo, widgetId);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { title, widgetId } = this.props;

      return (
        <Card className="h-full p-3 border-destructive/50 bg-destructive/5 flex flex-col">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs font-medium truncate">{title || 'Widget'} Error</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2 flex-1">
            {this.state.error?.message || 'Failed to render widget'}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[60%]">
              {widgetId}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="h-6 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';

/**
 * OMN-24616 AC5: one boundary around each page. A render error on a page shows that page's failure with its reason,
 * inside the app frame, instead of unmounting the whole app (a blank window). The App keys it by page, so moving to
 * another page starts it clean.
 */
interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  message: string | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[PageErrorBoundary] ${this.props.title} failed to render:`, error, info.componentStack);
  }

  override render() {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="local-dashboard-page" aria-label={`${this.props.title} page`}>
        <header className="local-dashboard-header"><div className="local-dashboard-title"><div><h1>{this.props.title}</h1></div></div></header>
        <div role="alert" className="local-page-error">
          <p>{this.props.title} could not be shown: {this.state.message}</p>
          <p><Link href="/overview">Go to Overview</Link></p>
        </div>
      </main>
    );
  }
}

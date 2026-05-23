import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Text } from '@/components/ui/typography';

interface Props {
  componentName: string;
  onRemove?: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[WidgetErrorBoundary] ${this.props.componentName} crashed:`, error, info);
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        data-testid="widget-error-boundary"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '2rem',
          border: '1px solid var(--status-bad)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--panel)',
          minHeight: 120,
        }}
      >
        <Text as="div" size="md" color="bad">
          This widget failed to load
        </Text>
        <Text as="div" size="sm" color="tertiary" family="mono">
          {this.state.message}
        </Text>
        {this.props.onRemove && (
          <button
            type="button"
            onClick={this.props.onRemove}
            style={{
              marginTop: 4,
              padding: '4px 12px',
              border: '1px solid var(--status-bad)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--text-bad)',
              cursor: 'pointer',
            }}
          >
            <Text as="span" size="sm" color="bad">Remove from layout</Text>
          </button>
        )}
      </div>
    );
  }
}

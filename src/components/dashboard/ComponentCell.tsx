import { Suspense, type LazyExoticComponent, type ComponentType } from 'react';

interface ComponentCellProps {
  componentName: string;
  config: Record<string, unknown>;
  component?: LazyExoticComponent<ComponentType<any>>;
  emptyMessage?: string;
}

export function ComponentCell({ componentName, config, component: LazyComponent }: ComponentCellProps) {
  if (!LazyComponent) {
    return (
      <div data-testid="grid-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
        <span>{componentName} — not available</span>
      </div>
    );
  }

  return (
    <div data-testid="grid-cell" style={{ height: '100%', overflow: 'hidden' }}>
      <Suspense fallback={<div>Loading {componentName}...</div>}>
        <LazyComponent config={config} />
      </Suspense>
    </div>
  );
}

import type { ReactNode } from 'react';
import * as s from './ComponentWrapper.css';

interface ComponentWrapperProps {
  title: string;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  children: ReactNode;
}

export function ComponentWrapper({ title, isLoading, error, isEmpty, emptyMessage, emptyHint, children }: ComponentWrapperProps) {
  return (
    <div className={s.wrapper}>
      <div className={s.componentHeader}>
        <span className={s.componentTitle}>{title}</span>
      </div>
      <div className={s.componentBody}>
        {isLoading && <div className={s.loadingState}>Loading...</div>}
        {error && <div className={s.errorState}>Error: {error.message}</div>}
        {!isLoading && !error && isEmpty && (
          <div className={s.emptyState}>
            <span className={s.emptyMessage}>{emptyMessage || 'No data available'}</span>
            {emptyHint && <span className={s.emptyHint}>{emptyHint}</span>}
          </div>
        )}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </div>
  );
}

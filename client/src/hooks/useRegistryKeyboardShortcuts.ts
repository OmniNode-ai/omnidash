/**
 * useRegistryKeyboardShortcuts Hook
 *
 * Manages keyboard shortcuts for the Registry Discovery dashboard.
 *
 * Shortcuts:
 * - R: Refresh data
 * - F: Focus search input
 * - Escape: Close detail panel
 */

import { useEffect, type RefObject } from 'react';

/**
 * Options for the keyboard shortcuts hook
 */
export interface UseRegistryKeyboardShortcutsOptions {
  /** Callback to refresh data */
  onRefresh: () => void;
  /** Callback to close detail panel */
  onClosePanel: () => void;
  /** Ref to the search input for focus */
  searchInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Hook for managing keyboard shortcuts on the Registry Discovery dashboard.
 *
 * @example
 * ```tsx
 * useRegistryKeyboardShortcuts({
 *   onRefresh: handleRefresh,
 *   onClosePanel: closeDetailPanel,
 *   searchInputRef: capabilityInputRef,
 * });
 * ```
 */
export function useRegistryKeyboardShortcuts({
  onRefresh,
  onClosePanel,
  searchInputRef,
}: UseRegistryKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // Allow Escape to blur and close panel
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          onClosePanel();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          e.preventDefault();
          onRefresh();
          break;
        case 'f':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'escape':
          onClosePanel();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRefresh, onClosePanel, searchInputRef]);
}

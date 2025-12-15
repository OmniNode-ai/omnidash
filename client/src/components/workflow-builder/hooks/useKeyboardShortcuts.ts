import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  selectedNodeIds: string[];
  selectedConnectionId: string | null;
  isDrawingConnection: boolean;
  isRewiring: boolean;
  isMarqueeSelecting: boolean;
  onDeleteNodes: (nodeIds: string[]) => void;
  onDeleteConnection: (connectionId: string) => void;
  onCopyNodes: () => void;
  onPasteNodes: () => void | Promise<void>;
  onCancelConnection: () => void;
  onCancelRewire: () => void;
  onCancelMarquee: () => void;
  onClearSelection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Handles keyboard shortcuts for the workflow canvas.
 * - Delete/Backspace: Delete selected nodes or connection
 * - Ctrl+C: Copy selected nodes
 * - Ctrl+V: Paste nodes from clipboard
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 * - Escape: Cancel current operation and clear selection
 */
export function useKeyboardShortcuts({
  selectedNodeIds,
  selectedConnectionId,
  isDrawingConnection,
  isRewiring,
  isMarqueeSelecting,
  onDeleteNodes,
  onDeleteConnection,
  onCopyNodes,
  onPasteNodes,
  onCancelConnection,
  onCancelRewire,
  onCancelMarquee,
  onClearSelection,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if no input is focused
      const isInputFocused = document.activeElement !== document.body;

      // Delete/Backspace - delete selected items
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInputFocused) {
          e.preventDefault();
          if (selectedNodeIds.length > 0) {
            onDeleteNodes(selectedNodeIds);
          } else if (selectedConnectionId) {
            onDeleteConnection(selectedConnectionId);
          }
        }
      }

      // Ctrl+C - copy selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (!isInputFocused && selectedNodeIds.length > 0) {
          e.preventDefault();
          onCopyNodes();
        }
      }

      // Ctrl+V - paste nodes from system clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (!isInputFocused) {
          e.preventDefault();
          // onPasteNodes reads from system clipboard and handles invalid data gracefully
          onPasteNodes();
        }
      }

      // Ctrl+Z - undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (!isInputFocused && canUndo) {
          e.preventDefault();
          onUndo();
        }
      }

      // Ctrl+Shift+Z or Ctrl+Y - redo
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        if (!isInputFocused && canRedo) {
          e.preventDefault();
          onRedo();
        }
      }

      // Escape - cancel operations and clear selection
      if (e.key === 'Escape') {
        if (isDrawingConnection) {
          onCancelConnection();
        }
        if (isRewiring) {
          onCancelRewire();
        }
        if (isMarqueeSelecting) {
          onCancelMarquee();
        }
        onClearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeIds,
    selectedConnectionId,
    isDrawingConnection,
    isRewiring,
    isMarqueeSelecting,
    onDeleteNodes,
    onDeleteConnection,
    onCopyNodes,
    onPasteNodes,
    onCancelConnection,
    onCancelRewire,
    onCancelMarquee,
    onClearSelection,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  ]);
}

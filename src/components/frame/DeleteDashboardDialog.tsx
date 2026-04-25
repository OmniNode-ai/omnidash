// Delete-dashboard confirmation dialog (OMN-127). Reuses the
// `.modal-backdrop` / `.modal` CSS classes from
// `src/styles/modals.css` so visual styling stays consistent with
// `ComponentConfigPanel`. The dialog is stateless — its parent owns
// "which dashboard, if any, is pending deletion" and passes the
// dashboard name + the confirm/cancel handlers in.
//
// Behavior:
//   - Backdrop click and Escape both dismiss as cancel (no delete).
//   - Confirm button is `btn danger` so the destructive action reads
//     visually distinct from the Cancel button.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Text } from '@/components/ui/typography';

export interface DeleteDashboardDialogProps {
  /** Name of the dashboard being deleted; null when the dialog is closed. */
  dashboardName: string | null;
  /** Called when the user clicks Delete. Caller is expected to actually delete. */
  onConfirm: () => void;
  /** Called on Cancel, Escape, backdrop click, or close button. */
  onCancel: () => void;
}

export function DeleteDashboardDialog({
  dashboardName,
  onConfirm,
  onCancel,
}: DeleteDashboardDialogProps) {
  const open = dashboardName !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dashboard-title"
        data-testid="delete-dashboard-dialog"
      >
        <div className="modal-head">
          <h2 id="delete-dashboard-title">Delete dashboard?</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <Text as="p" size="md" style={{ margin: 0 }}>
            You're about to delete <strong>{dashboardName}</strong>. This
            cannot be undone.
          </Text>
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            aria-label="Cancel deletion"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirm}
            aria-label={`Delete ${dashboardName}`}
            autoFocus
          >
            Delete dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

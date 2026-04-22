// SOURCE: Claude Design prototype (app.jsx:704-775, OmniDash.html:524-580).
// Markup follows the prototype's .modal-backdrop / .modal structure verbatim
// so future design iterations from Claude Design can be integrated with
// minimal translation. CSS for .modal-* / .field / .check lives in
// src/styles/modals.css.
//
// Deviations from the prototype:
//   - Form body uses @rjsf/core rendering from the widget's JSON configSchema
//     rather than hand-authored fields. The prototype's widgets have static,
//     known field sets; v2 widgets publish arbitrary schemas, so schema-driven
//     rendering is the correct fit.
//   - Save button commits this placement's draft via the store's commitDraft
//     action; the prototype calls onSave(newValues) — same effect, different
//     wiring.
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';

interface ComponentConfigPanelProps {
  /** Placement id currently being configured; null when the dialog is closed. */
  placementId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ComponentConfigPanel({ placementId, onOpenChange }: ComponentConfigPanelProps) {
  const registry = useRegistry();

  const placement = useFrameStore((s) =>
    placementId ? (s.activeDashboard?.layout.find((l) => l.i === placementId) ?? null) : null,
  );
  const draft = useFrameStore((s) => (placementId ? s.placementDrafts[placementId] : undefined));
  const setDraftConfig = useFrameStore((s) => s.setDraftConfig);
  const commitDraft = useFrameStore((s) => s.commitDraft);
  const discardDraft = useFrameStore((s) => s.discardDraft);

  const entry = placement ? registry.getComponent(placement.componentName) : null;
  const open = Boolean(placementId && placement && entry);

  // Escape dismisses without committing. Outside-click (backdrop) also
  // dismisses — handled via the backdrop onClick below.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open || !entry || !placementId) return null;

  const formData: Record<string, unknown> =
    draft?.draftConfig ?? (placement ? { ...placement.config } : {});

  const handleChange = (e: IChangeEvent<Record<string, unknown>>) => {
    const hasErrors = (e.errors?.length ?? 0) > 0;
    setDraftConfig(placementId, e.formData ?? {}, hasErrors);
  };

  const handleCancel = () => {
    // Cancel discards this placement's draft and closes.
    discardDraft(placementId);
    onOpenChange(false);
  };

  const handleSave = () => {
    commitDraft(placementId);
    onOpenChange(false);
  };

  const hasErrors = draft?.hasValidationErrors ?? false;

  return (
    <div className="modal-backdrop" onClick={() => onOpenChange(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="config-panel">
        <div className="modal-head">
          <h2>Configure · {entry.manifest.displayName}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <Form
            schema={entry.manifest.configSchema}
            formData={formData}
            validator={validator}
            onChange={handleChange}
            uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
            liveValidate
          />
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn ghost"
            onClick={handleCancel}
            aria-label="Discard config changes"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={hasErrors}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

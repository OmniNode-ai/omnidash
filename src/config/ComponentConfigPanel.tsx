import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import { useFrameStore } from '@/store/store';
import { useRegistry } from '@/registry/RegistryProvider';
import * as s from './ComponentConfigPanel.css';

interface ComponentConfigPanelProps {
  placementId: string;
}

export function ComponentConfigPanel({ placementId }: ComponentConfigPanelProps) {
  const registry = useRegistry();

  const placement = useFrameStore((s) =>
    s.activeDashboard?.layout.find((l) => l.i === placementId) ?? null
  );
  const draft = useFrameStore((s) => s.placementDrafts[placementId]);
  const setDraftConfig = useFrameStore((s) => s.setDraftConfig);
  const discardDraft = useFrameStore((s) => s.discardDraft);

  if (!placement) return null;

  const entry = registry.getComponent(placement.componentName);
  if (!entry) return null;

  const schema = entry.manifest.configSchema;

  // The live formData: prefer the in-memory draft, fall back to persisted config.
  const formData: Record<string, unknown> = draft?.draftConfig ?? { ...placement.config };

  const handleChange = (e: IChangeEvent<Record<string, unknown>>) => {
    const hasErrors = (e.errors?.length ?? 0) > 0;
    setDraftConfig(placementId, e.formData ?? {}, hasErrors);
  };

  const handleDiscard = () => {
    discardDraft(placementId);
  };

  return (
    <div className={s.panel} data-testid="config-panel">
      <div className={s.header}>
        <span className={s.title}>{entry.manifest.displayName} Config</span>
        <button
          type="button"
          className={s.discardButton}
          aria-label="Discard config changes"
          onClick={handleDiscard}
        >
          Discard
        </button>
      </div>
      <Form
        schema={schema}
        formData={formData}
        validator={validator}
        onChange={handleChange}
        // Suppress the submit button — Save is handled at the DashboardBuilder level.
        uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
        liveValidate
      />
    </div>
  );
}

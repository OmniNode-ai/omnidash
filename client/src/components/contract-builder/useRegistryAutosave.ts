/**
 * useRegistryAutosave Hook
 *
 * Saves draft contract data to the registry API every 30 seconds while editing.
 * Also exposes a dirty-state indicator and a manual save trigger.
 *
 * Fulfills OMN-2541:
 * - "Drafts autosave to the registry every 30 seconds while editing"
 * - "Unsaved-change indicator (dirty state) in the editor toolbar"
 * - "Manual save always available"
 *
 * Falls back to localStorage (via useAutosaveDraft) when no contractId is
 * available (i.e., the contract has not yet been persisted to the API).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ContractType } from './models/types';

const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseRegistryAutosaveOptions {
  /** ID of the contract to update (undefined = not yet persisted) */
  contractId?: string;
  contractType: ContractType;
  formData: Record<string, unknown>;
  /** Initial data to compare against for dirty-state detection */
  initialFormData?: Record<string, unknown>;
  /** Whether the editor is active */
  enabled?: boolean;
}

export interface UseRegistryAutosaveReturn {
  /** Whether form data differs from last saved state */
  isDirty: boolean;
  /** Current autosave status */
  autosaveStatus: AutosaveStatus;
  /** ISO timestamp of last successful save, or null */
  lastSavedAt: string | null;
  /** Manually trigger a save */
  triggerSave: () => Promise<void>;
}

export function useRegistryAutosave({
  contractId,
  formData,
  initialFormData,
  enabled = true,
}: UseRegistryAutosaveOptions): UseRegistryAutosaveReturn {
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const formDataRef = useRef(formData);
  const initialFormDataRef = useRef(initialFormData);
  const savedFormDataRef = useRef<string | null>(null);

  formDataRef.current = formData;
  initialFormDataRef.current = initialFormData;

  // Detect dirty state by comparing current form data to last-saved or initial
  useEffect(() => {
    if (!enabled) {
      setIsDirty(false);
      return;
    }

    const current = JSON.stringify(formData);
    const baseline = savedFormDataRef.current ?? JSON.stringify(initialFormData);

    if (baseline === undefined || baseline === 'undefined') {
      // No initial data yet (RJSF still initializing) — not dirty
      setIsDirty(false);
      return;
    }

    setIsDirty(current !== baseline);
  }, [formData, initialFormData, enabled]);

  // Core save function
  const doSave = useCallback(async (): Promise<void> => {
    if (!contractId) {
      // No ID yet — nothing to save to the API
      return;
    }

    setAutosaveStatus('saving');

    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData: formDataRef.current }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      savedFormDataRef.current = JSON.stringify(formDataRef.current);
      const now = new Date().toISOString();
      setLastSavedAt(now);
      setAutosaveStatus('saved');
      setIsDirty(false);

      // Reset to idle after brief feedback delay
      setTimeout(() => setAutosaveStatus('idle'), 3000);
    } catch (err) {
      console.warn('[useRegistryAutosave] Save error:', err);
      setAutosaveStatus('error');
      setTimeout(() => setAutosaveStatus('idle'), 5000);
    }
  }, [contractId]);

  // 30-second interval autosave
  useEffect(() => {
    if (!enabled || !contractId) return;

    const interval = setInterval(() => {
      if (isDirty) {
        void doSave();
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, contractId, isDirty, doSave]);

  // Save before page unload
  useEffect(() => {
    if (!enabled || !contractId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        // Attempt a best-effort synchronous-style save via beacon
        const body = JSON.stringify({ formData: formDataRef.current });
        navigator.sendBeacon(`/api/contracts/${contractId}/draft`, body);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, contractId, isDirty]);

  return {
    isDirty,
    autosaveStatus,
    lastSavedAt,
    triggerSave: doSave,
  };
}

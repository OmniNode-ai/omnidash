/**
 * Autosave Draft Hook
 *
 * Minimal localStorage-based autosave for contract editor drafts.
 * - Debounced save on change (2s delay)
 * - Save before page unload
 * - Check for existing draft on mount
 * - Clear draft on explicit save
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ContractType } from './models/types';

const STORAGE_PREFIX = 'contract-draft:';
const DEBOUNCE_MS = 2000;

interface DraftData {
  contractType: ContractType;
  contractId?: string;
  formData: Record<string, unknown>;
  savedAt: string;
}

interface UseAutosaveDraftOptions {
  contractType: ContractType;
  contractId?: string;
  formData: Record<string, unknown>;
  /** Initial form data to compare against - only save draft if data has changed */
  initialFormData?: Record<string, unknown>;
  enabled?: boolean;
}

interface UseAutosaveDraftReturn {
  /** Draft found on mount, if any */
  existingDraft: DraftData | null;
  /** Dismiss the existing draft (don't restore) */
  dismissDraft: () => void;
  /** Clear the draft from storage (call after successful save) */
  clearDraft: () => void;
  /** Whether autosave is active */
  isAutosaving: boolean;
}

function getDraftKey(contractType: ContractType, contractId?: string): string {
  return `${STORAGE_PREFIX}${contractType}:${contractId || 'new'}`;
}

function loadDraft(key: string): DraftData | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(key: string, data: DraftData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save draft:', e);
  }
}

function removeDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

export function useAutosaveDraft({
  contractType,
  contractId,
  formData,
  initialFormData,
  enabled = true,
}: UseAutosaveDraftOptions): UseAutosaveDraftReturn {
  const draftKey = getDraftKey(contractType, contractId);
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  const initialFormDataRef = useRef(initialFormData);

  // Keep refs updated for beforeunload handler
  formDataRef.current = formData;
  initialFormDataRef.current = initialFormData;

  // Check if form data has changed from initial state
  const hasChanges = useCallback((currentData: Record<string, unknown>) => {
    // If no initial data yet (e.g., waiting for RJSF to initialize), assume no changes
    if (!initialFormDataRef.current) return false;
    return JSON.stringify(currentData) !== JSON.stringify(initialFormDataRef.current);
  }, []);

  // Check for existing draft on mount
  useEffect(() => {
    if (!enabled) return;

    const draft = loadDraft(draftKey);
    if (draft) {
      setExistingDraft(draft);
    }
  }, [draftKey, enabled]);

  // Debounced autosave on formData change
  useEffect(() => {
    if (!enabled || existingDraft) return; // Don't autosave while showing recovery prompt

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only save if there are actual changes from initial state
    if (!hasChanges(formData)) {
      // No changes - clear any existing draft for this key
      removeDraft(draftKey);
      return;
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      setIsAutosaving(true);
      saveDraft(draftKey, {
        contractType,
        contractId,
        formData,
        savedAt: new Date().toISOString(),
      });
      setIsAutosaving(false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formData, draftKey, contractType, contractId, enabled, existingDraft, hasChanges]);

  // Save before page unload (only if there are changes)
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      // Only save if there are actual changes from initial state
      if (!hasChanges(formDataRef.current)) return;

      // Use ref to get latest formData
      saveDraft(draftKey, {
        contractType,
        contractId,
        formData: formDataRef.current,
        savedAt: new Date().toISOString(),
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [draftKey, contractType, contractId, enabled, hasChanges]);

  const dismissDraft = useCallback(() => {
    // Remove draft from localStorage immediately when user dismisses
    // This prevents the notification from reappearing on subsequent visits
    removeDraft(draftKey);
    setExistingDraft(null);
  }, [draftKey]);

  const clearDraft = useCallback(() => {
    removeDraft(draftKey);
    setExistingDraft(null);
  }, [draftKey]);

  return {
    existingDraft,
    dismissDraft,
    clearDraft,
    isAutosaving,
  };
}

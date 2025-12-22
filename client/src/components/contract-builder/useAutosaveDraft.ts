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
  enabled = true,
}: UseAutosaveDraftOptions): UseAutosaveDraftReturn {
  const draftKey = getDraftKey(contractType, contractId);
  const [existingDraft, setExistingDraft] = useState<DraftData | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);

  // Keep formData ref updated for beforeunload handler
  formDataRef.current = formData;

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
  }, [formData, draftKey, contractType, contractId, enabled, existingDraft]);

  // Save before page unload
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
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
  }, [draftKey, contractType, contractId, enabled]);

  const dismissDraft = useCallback(() => {
    setExistingDraft(null);
    // Don't remove from storage - user chose not to restore, but draft stays
    // until they make changes (which will overwrite it)
  }, []);

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

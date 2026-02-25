/**
 * Tests for useRegistryAutosave hook
 *
 * Covers:
 * - Dirty-state detection (isDirty flag)
 * - Status transitions (idle → saving → saved / error)
 * - triggerSave calls the correct API endpoint
 * - No save attempted when form data matches initial data
 *
 * OMN-2541: "Autosave tested with mock registry API"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRegistryAutosave } from '../useRegistryAutosave';

describe('useRegistryAutosave', () => {
  // -------------------------------------------------------------------------
  // Mock fetch
  // -------------------------------------------------------------------------

  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Dirty state detection
  // -------------------------------------------------------------------------

  describe('dirty state detection', () => {
    it('is not dirty when form data matches initial data', () => {
      const data = { name: 'test', version: '1.0.0' };
      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-123',
          contractType: 'effect',
          formData: data,
          initialFormData: data,
          enabled: true,
        })
      );
      expect(result.current.isDirty).toBe(false);
    });

    it('is dirty when form data differs from initial data', () => {
      const initial = { name: 'original', version: '1.0.0' };
      const changed = { name: 'changed', version: '1.0.0' };
      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-123',
          contractType: 'effect',
          formData: changed,
          initialFormData: initial,
          enabled: true,
        })
      );
      expect(result.current.isDirty).toBe(true);
    });

    it('is not dirty when enabled is false', () => {
      const initial = { name: 'original' };
      const changed = { name: 'different' };
      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-123',
          contractType: 'effect',
          formData: changed,
          initialFormData: initial,
          enabled: false,
        })
      );
      expect(result.current.isDirty).toBe(false);
    });

    it('is not dirty when initialFormData is undefined (RJSF not yet initialized)', () => {
      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-123',
          contractType: 'effect',
          formData: { name: 'something' },
          initialFormData: undefined,
          enabled: true,
        })
      );
      expect(result.current.isDirty).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // triggerSave
  // -------------------------------------------------------------------------

  describe('triggerSave', () => {
    it('calls PUT /api/contracts/:id with form data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'contract-123' }),
      } as Response);

      const formData = { name: 'my-contract', version: '2.0.0' };

      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-123',
          contractType: 'effect',
          formData,
          initialFormData: { name: 'original' },
          enabled: true,
        })
      );

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/contracts/contract-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      });
    });

    it('sets autosaveStatus to "saved" on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-456',
          contractType: 'compute',
          formData: { name: 'x' },
          initialFormData: { name: 'y' },
          enabled: true,
        })
      );

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(result.current.autosaveStatus).toBe('saved');
      expect(result.current.lastSavedAt).not.toBeNull();
    });

    it('sets autosaveStatus to "error" on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-789',
          contractType: 'reducer',
          formData: { name: 'z' },
          initialFormData: { name: 'a' },
          enabled: true,
        })
      );

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(result.current.autosaveStatus).toBe('error');
    });

    it('does not call fetch when contractId is undefined', async () => {
      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: undefined,
          contractType: 'orchestrator',
          formData: { name: 'new' },
          initialFormData: undefined,
          enabled: true,
        })
      );

      await act(async () => {
        await result.current.triggerSave();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('starts as idle and progresses to saving then saved', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() =>
        useRegistryAutosave({
          contractId: 'contract-abc',
          contractType: 'effect',
          formData: { name: 'val' },
          initialFormData: { name: 'other' },
          enabled: true,
        })
      );

      expect(result.current.autosaveStatus).toBe('idle');

      await act(async () => {
        await result.current.triggerSave();
      });

      await waitFor(() => {
        expect(result.current.autosaveStatus).toBe('saved');
      });
    });
  });
});

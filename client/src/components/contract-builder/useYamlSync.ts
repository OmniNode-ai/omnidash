/**
 * useYamlSync Hook
 *
 * Manages bidirectional sync between form data (object) and YAML text.
 *
 * Sync model (OMN-2541):
 * - Form → YAML: whenever formData changes, YAML is recomputed immediately
 * - YAML → Form: when the user edits YAML, changes are applied to formData
 *   with a debounce (300ms) to avoid infinite update loops
 * - Invalid YAML in the editor does not overwrite form state
 * - Round-trip (form → YAML → form) produces identical output
 *
 * The hook exposes a "diverged" flag when the YAML has been hand-edited and
 * differs from the canonical serialization of the form data. The caller can
 * offer a "normalize and apply" action in that case.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as jsYaml from 'js-yaml';
import type { RJSFSchema } from '@rjsf/utils';

const YAML_SYNC_DEBOUNCE_MS = 300;

const DUMP_OPTIONS: jsYaml.DumpOptions = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
  styles: { '!!null': 'lowercase' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a skeleton object from a JSON Schema with all leaf values set to null.
 * This ensures all possible fields appear in the YAML output even when empty.
 */
function buildSkeleton(schema: RJSFSchema): unknown {
  if (!schema || typeof schema !== 'object') return null;

  const type = schema.type as string | undefined;

  if (type === 'object') {
    const properties = schema.properties as Record<string, RJSFSchema> | undefined;
    if (!properties) return {};
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = buildSkeleton(propSchema);
    }
    return result;
  }

  if (type === 'array') {
    return [];
  }

  return null;
}

/**
 * Merge form data over a skeleton, preserving all skeleton keys (even if null)
 * while honouring actual form values.
 */
function mergeWithSkeleton(skeleton: unknown, data: unknown): unknown {
  if (data !== undefined && data !== null) {
    if (
      typeof data === 'object' &&
      !Array.isArray(data) &&
      typeof skeleton === 'object' &&
      skeleton !== null &&
      !Array.isArray(skeleton)
    ) {
      const result: Record<string, unknown> = {};
      const skeletonObj = skeleton as Record<string, unknown>;
      const dataObj = data as Record<string, unknown>;
      for (const key of Object.keys(skeletonObj)) {
        result[key] = mergeWithSkeleton(skeletonObj[key], dataObj[key]);
      }
      for (const key of Object.keys(dataObj)) {
        if (!(key in result)) {
          result[key] = dataObj[key];
        }
      }
      return result;
    }
    return data;
  }
  return skeleton;
}

/**
 * Serialize form data to a canonical YAML string.
 * Returns null on serialization error.
 */
export function serializeToYaml(formData: Record<string, unknown>, schema: RJSFSchema): string {
  try {
    const skeleton = buildSkeleton(schema);
    const merged = mergeWithSkeleton(skeleton, formData);
    return jsYaml.dump(merged, DUMP_OPTIONS);
  } catch {
    return '# Error converting to YAML';
  }
}

/**
 * Parse a YAML string into a plain object.
 * Returns null on parse error so form state is never corrupted.
 */
export function parseYaml(yamlText: string): Record<string, unknown> | null {
  try {
    const parsed = jsYaml.load(yamlText);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface YamlSyncState {
  /** Current YAML text shown in the editor */
  yamlText: string;
  /** Whether the YAML text has a parse error */
  yamlError: string | null;
  /** Whether YAML was hand-edited and differs from canonical form serialization */
  isDiverged: boolean;
  /** Call this when the YAML editor value changes */
  onYamlChange: (newYaml: string) => void;
  /** Force-sync YAML from current form data (normalize action) */
  normalizeYaml: () => void;
  /** The normalized YAML (canonical form) for diff preview */
  canonicalYaml: string;
}

export interface UseYamlSyncOptions {
  formData: Record<string, unknown>;
  schema: RJSFSchema;
  onFormDataChange: (data: Record<string, unknown>) => void;
}

export function useYamlSync({
  formData,
  schema,
  onFormDataChange,
}: UseYamlSyncOptions): YamlSyncState {
  // The canonical serialization of the current form data
  const canonicalYaml = useMemo(() => serializeToYaml(formData, schema), [formData, schema]);

  // What is actually shown in the YAML editor (may diverge from canonical)
  const [yamlText, setYamlText] = useState<string>(() => canonicalYaml);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [isDiverged, setIsDiverged] = useState(false);

  // Guard against cycles: when form data changes because of a YAML edit, we
  // must not immediately overwrite the editor text again.
  const isYamlDrivingFormRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When form data changes from outside (form widget interaction), update YAML
  // — unless the YAML edit is what caused the form change.
  useEffect(() => {
    if (isYamlDrivingFormRef.current) {
      // Originated from YAML → form sync; don't overwrite the editor
      isYamlDrivingFormRef.current = false;
      return;
    }
    // Form drove the change — re-sync YAML and clear diverged state
    setYamlText(canonicalYaml);
    setIsDiverged(false);
    setYamlError(null);
  }, [canonicalYaml]);
  // Note: we intentionally depend only on canonicalYaml (not formData) to
  // avoid running on every render. canonicalYaml is memoized on formData.

  // YAML editor change handler — debounce form update
  const onYamlChange = useCallback(
    (newYaml: string) => {
      setYamlText(newYaml);
      setYamlError(null);

      // Clear pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const parsed = parseYaml(newYaml);
        if (parsed === null) {
          // Invalid YAML — show error, do NOT overwrite form data
          if (newYaml.trim()) {
            setYamlError('Invalid YAML — fix syntax errors before changes are applied to the form');
          }
          setIsDiverged(true);
          return;
        }

        // Valid YAML — apply to form data
        isYamlDrivingFormRef.current = true;
        const canonicalOfParsed = serializeToYaml(parsed, schema);
        const diverged = canonicalOfParsed !== canonicalYaml;
        setIsDiverged(diverged);
        onFormDataChange(parsed);
      }, YAML_SYNC_DEBOUNCE_MS);
    },
    [canonicalYaml, schema, onFormDataChange]
  );

  // Normalize: force YAML editor to match the canonical form serialization
  const normalizeYaml = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setYamlText(canonicalYaml);
    setIsDiverged(false);
    setYamlError(null);
  }, [canonicalYaml]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    yamlText,
    yamlError,
    isDiverged,
    onYamlChange,
    normalizeYaml,
    canonicalYaml,
  };
}

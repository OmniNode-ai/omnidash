/**
 * useContractSchema Hook
 *
 * Fetches the JSON Schema and UI Schema for a given contract type from the
 * registry API. Falls back to the bundled static schema on API failure.
 *
 * Fulfills OMN-2541: schemas are fetched at runtime — no hard-coded fields.
 */

import { useState, useEffect } from 'react';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { fetchContractSchemas } from './schemas';
import type { ContractType } from './models/types';

export interface ContractSchemaState {
  jsonSchema: RJSFSchema;
  uiSchema: UiSchema;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_SCHEMA: RJSFSchema = { type: 'object', properties: {} };
const EMPTY_UI_SCHEMA: UiSchema = {};

/**
 * Hook that fetches the contract schema for a given type from the registry API.
 *
 * @param contractType - The ONEX node type to fetch the schema for
 * @returns Schema state with jsonSchema, uiSchema, isLoading, and error
 */
export function useContractSchema(contractType: ContractType): ContractSchemaState {
  const [jsonSchema, setJsonSchema] = useState<RJSFSchema>(EMPTY_SCHEMA);
  const [uiSchema, setUiSchema] = useState<UiSchema>(EMPTY_UI_SCHEMA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSchema() {
      setIsLoading(true);
      setError(null);

      try {
        const schemas = await fetchContractSchemas(contractType);
        if (!cancelled) {
          setJsonSchema(schemas.jsonSchema ?? EMPTY_SCHEMA);
          setUiSchema(schemas.uiSchema ?? EMPTY_UI_SCHEMA);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load schema';
          setError(message);
          // Keep the empty schema so the editor remains functional
          setJsonSchema(EMPTY_SCHEMA);
          setUiSchema(EMPTY_UI_SCHEMA);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSchema();

    return () => {
      cancelled = true;
    };
  }, [contractType]);

  return { jsonSchema, uiSchema, isLoading, error };
}

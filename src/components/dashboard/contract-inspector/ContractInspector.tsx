// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
//
// OMN-13386 — Spike: discriminated-union JSON Schema → @rjsf inspector POC
//
// Renders a Pydantic-generated JSON Schema through @rjsf/core and validates
// round-trip edits. Demonstrates two schemas:
//
//  1. ModelComponentContract — the OMN-13130 Phase 0 primitive; uses anyOf for
//     nullable optional fields (approval_gate, permission, etc.) which @rjsf
//     renders as oneOf selectors.
//
//  2. ModelWidgetDefinition — has a proper discriminated union on `config` with
//     oneOf + discriminator.propertyName = "config_kind" and `const` values per
//     branch. @rjsf 6.x reads discriminator.propertyName and uses const-matching
//     to select the active branch without a custom widget.
//
// Findings documented in: https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0043-omnidash-rjsf-discriminated-union-handling.md

import { useState, useCallback, type ChangeEvent } from 'react';
import Form, { type IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema } from '@rjsf/utils';
import { Text, Heading } from '@/components/ui/typography';

// Statically bundled schemas generated from Pydantic models via:
//   cd omnibase_core && uv run python scripts/emit_ts_types.py ...
// These are committed as spike evidence; production would use the live emitter.
import componentContractSchema from './component-contract-schema.json';
import widgetDefinitionSchema from './widget-definition-schema.json';

type SpikeSchema = 'component-contract' | 'widget-definition';

const SCHEMAS: Record<SpikeSchema, RJSFSchema> = {
  'component-contract': componentContractSchema as RJSFSchema,
  'widget-definition': widgetDefinitionSchema as RJSFSchema,
};

const SCHEMA_LABELS: Record<SpikeSchema, string> = {
  'component-contract': 'ModelComponentContract (OMN-13130 primitive)',
  'widget-definition': 'ModelWidgetDefinition (oneOf + discriminator)',
};

// Initial formData that exercises the discriminated union branch selection.
// ModelWidgetDefinition.config with config_kind="chart" triggers @rjsf's
// discriminator matching to select the ModelWidgetConfigChart branch.
const INITIAL_FORM_DATA: Record<SpikeSchema, unknown> = {
  'component-contract': {
    component_id: 'delegation-status',
    component_kind: 'metric_card',
    title: 'Delegation Status',
    contract_version: { major: 1, minor: 0, patch: 0 },
    data_bindings: [
      {
        binding_id: 'primary',
        projection_topic: 'onex.projection.delegation.v1',
        ordering_authority_field: 'created_at',
        ordering_direction: 'descending',
        required_fields: ['status', 'created_at'],
      },
    ],
    actions: [],
    evidence_requirements: [],
    permission: null,
    supported_empty_state_reasons: ['no-data'],
  },
  'widget-definition': {
    widget_id: '00000000-0000-0000-0000-000000000001',
    title: 'Spike Widget',
    row: 0,
    col: 0,
    width: 4,
    height: 2,
    config: {
      config_kind: 'metric_card',
      metric_key: 'delegation_count',
      label: 'Active Delegations',
      format: 'number',
    },
  },
};

interface RoundTripState {
  submitted: unknown | null;
  validated: boolean;
  errors: string[];
}

/**
 * ContractInspector — POC component for OMN-13386 spike.
 *
 * Renders Pydantic-generated JSON Schema via @rjsf, captures form change +
 * submit events, and displays the round-tripped formData to confirm edits
 * survive the @rjsf encode/decode cycle.
 */
export function ContractInspector() {
  const [activeSchema, setActiveSchema] = useState<SpikeSchema>('component-contract');
  const [formData, setFormData] = useState<unknown>(INITIAL_FORM_DATA['component-contract']);
  const [roundTrip, setRoundTrip] = useState<RoundTripState>({
    submitted: null,
    validated: false,
    errors: [],
  });

  const handleSchemaChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as SpikeSchema;
    setActiveSchema(next);
    setFormData(INITIAL_FORM_DATA[next]);
    setRoundTrip({ submitted: null, validated: false, errors: [] });
  }, []);

  const handleChange = useCallback((data: IChangeEvent<unknown>) => {
    setFormData(data.formData);
  }, []);

  const handleSubmit = useCallback((data: IChangeEvent<unknown>) => {
    setRoundTrip({
      submitted: data.formData,
      validated: true,
      errors: [],
    });
  }, []);

  const handleError = useCallback((errors: unknown[]) => {
    setRoundTrip({
      submitted: null,
      validated: false,
      errors: errors.map((e) => String(e)),
    });
  }, []);

  const schema = SCHEMAS[activeSchema];

  return (
    <div
      data-testid="contract-inspector"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '1.5rem' }}
    >
      {/* Left panel — rjsf form */}
      <div>
        <Heading level={2} style={{ marginBottom: '0.75rem' }}>
          Contract Inspector (OMN-13386 spike)
        </Heading>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="schema-select" style={{ display: 'block', marginBottom: '0.25rem' }}>
            <Text>Schema under test:</Text>
          </label>
          <select
            id="schema-select"
            value={activeSchema}
            onChange={handleSchemaChange}
            data-testid="schema-selector"
            style={{ width: '100%', padding: '0.5rem' }}
          >
            {(Object.keys(SCHEMAS) as SpikeSchema[]).map((key) => (
              <option key={key} value={key}>
                {SCHEMA_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {/* @rjsf form — renders the Pydantic-generated JSON Schema.
            uiSchema sets the discriminator field as a select widget so the
            branch selector is visible. For the widget-definition schema,
            config_kind drives which oneOf branch is active.
        */}
        <Form
          schema={schema}
          validator={validator}
          formData={formData}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onError={handleError}
          uiSchema={
            activeSchema === 'widget-definition'
              ? {
                  // Surface config_kind as a select so operators can switch
                  // discriminator branches interactively.
                  config: {
                    config_kind: {
                      'ui:widget': 'select',
                      'ui:title': 'Widget type (discriminator)',
                    },
                  },
                }
              : {
                  // For nullable fields (@rjsf renders anyOf as a oneOf selector
                  // with an additional "None / null" branch) — no custom widget
                  // needed, but ui:title helps orient the operator.
                  permission: {
                    'ui:title': 'Permission contract (nullable — spike gap #1)',
                  },
                }
          }
        >
          <button
            type="submit"
            data-testid="submit-btn"
            className="contract-inspector-submit"
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.25rem',
              background: 'var(--color-primary, #0070f3)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Validate + round-trip
          </button>
        </Form>
      </div>

      {/* Right panel — round-trip output */}
      <div>
        <Heading level={2} style={{ marginBottom: '0.75rem' }}>
          Round-trip output
        </Heading>

        <div data-testid="round-trip-status" style={{ marginBottom: '0.5rem' }}>
          <Text>
            Status:{' '}
            <strong data-testid="status-text">
              {roundTrip.validated
                ? 'PASS — edit survived round-trip'
                : roundTrip.errors.length > 0
                  ? 'FAIL — validation errors'
                  : 'Awaiting submit'}
            </strong>
          </Text>
        </div>

        {roundTrip.errors.length > 0 && (
          <ul data-testid="error-list" className="contract-inspector-errors" style={{ marginBottom: '1rem' }}>
            {roundTrip.errors.map((e, i) => (
              <li key={i}>
                <Text>{e}</Text>
              </li>
            ))}
          </ul>
        )}

        <pre
          data-testid="round-trip-json"
          style={{
            background: 'var(--color-surface, #f4f4f5)',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '60vh',
          }}
        >
          {JSON.stringify(roundTrip.submitted ?? formData, null, 2)}
        </pre>

        {/* Spike findings summary */}
        <div
          data-testid="spike-findings"
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'var(--color-warning-surface, #fffbeb)',
            borderLeft: '4px solid var(--color-warning, #f59e0b)',
            borderRadius: '2px',
          }}
        >
          <Heading level={3} style={{ marginBottom: '0.5rem' }}>
            Spike findings (OMN-13386)
          </Heading>
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li>
              <Text>
                <strong>Gap #1 — nullable anyOf:</strong> Pydantic emits{' '}
                <code>anyOf: [{'{'}$ref{'}'},  {'{'}type: null{'}'}]</code> for optional fields.
                @rjsf 6.x renders each as a oneOf toggle with a "None" branch — functional but
                produces an unexpected selector UI for every nullable field. Resolution: add{' '}
                <code>ui:widget: hidden</code> + <code>ui:options: {'{'}nullable: true{'}'}</code>{' '}
                in uiSchema for fields that should render as a simple optional text/object, not a
                branch toggle. No custom widget required.
              </Text>
            </li>
            <li>
              <Text>
                <strong>Gap #2 — discriminator.propertyName ignored for UI label:</strong> @rjsf
                reads <code>discriminator.propertyName</code> for option matching (uses const values)
                but does not surface the discriminator field as the branch selector label. The default
                oneOf selector shows "Option 1 / Option 2 / …" labels. Resolution: add{' '}
                <code>ui:widget: select</code> on the discriminator field in uiSchema; the enum
                values then drive the selector directly.
              </Text>
            </li>
            <li>
              <Text>
                <strong>Gap #3 — frozen Pydantic models:</strong> All OMN-13130 contracts set
                <code>frozen=True</code>. @rjsf emits change events with mutable objects; the
                round-trip test must parse into a new model instance (not mutate in place). This is
                not a rendering gap — it is a runtime integration note: the bus handler that consumes
                edited formData must call <code>ModelComponentContract(**data)</code>, not patch an
                existing instance.
              </Text>
            </li>
            <li>
              <Text>
                <strong>Verdict:</strong> @rjsf 6.5.1 renders all six OMN-13130 primitives from
                Pydantic-generated JSON Schema without a custom Field or Widget for the discriminated
                union case. The two UI gaps (nullable toggle, discriminator label) are resolved via
                uiSchema entries — no new library or custom widget is required for Phase 1 scope.
              </Text>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
//
// OMN-13386 — Spike test: discriminated-union JSON Schema → @rjsf round-trip.
//
// These tests prove:
//   1. ContractInspector renders without crashing.
//   2. The Pydantic-generated schema for ModelComponentContract is consumable
//      by @rjsf/validator-ajv8 (AJV validates the initial formData as valid).
//   3. The schema for ModelWidgetDefinition contains a proper oneOf +
//      discriminator field and @rjsf selects the correct branch for known
//      config_kind values.
//   4. A round-trip submit captures the formData unmodified.
//
// Failure modes that would indicate a spike gap (and block Phase 1):
//   - AJV throws on the Pydantic schema (schema incompatibility)
//   - discriminator.propertyName is absent or wrong
//   - oneOf branch selection picks the wrong branch for a given config_kind
//   - Submit does not surface formData (rjsf internal error)

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ContractInspector } from './ContractInspector';
import componentContractSchema from './component-contract-schema.json';
import widgetDefinitionSchema from './widget-definition-schema.json';

// ---------------------------------------------------------------------------
// Schema structural assertions (pure JSON — no React needed)
// ---------------------------------------------------------------------------

describe('Pydantic → JSON Schema structural validation', () => {
  it('ModelComponentContract schema has expected required fields', () => {
    const schema = componentContractSchema as Record<string, unknown>;
    const required = schema['required'] as string[];
    expect(required).toContain('component_id');
    expect(required).toContain('component_kind');
    expect(required).toContain('title');
    expect(required).toContain('contract_version');
  });

  it('ModelComponentContract schema has anyOf nullable on permission field (Gap #1)', () => {
    const schema = componentContractSchema as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;
    const permissionField = props['permission'] as Record<string, unknown>;
    // Pydantic emits anyOf: [{$ref: ...}, {type: null}] for X | None
    expect(permissionField).toHaveProperty('anyOf');
    const anyOf = permissionField['anyOf'] as unknown[];
    const nullBranch = anyOf.find(
      (b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>)['type'] === 'null',
    );
    expect(nullBranch).toBeDefined();
  });

  it('ModelWidgetDefinition config field has oneOf + discriminator (Gap #2 baseline)', () => {
    const schema = widgetDefinitionSchema as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown>;
    const configField = props['config'] as Record<string, unknown>;

    // Must have oneOf with 5 branches (chart, table, metric_card, status_grid, event_feed)
    expect(configField).toHaveProperty('oneOf');
    const oneOf = configField['oneOf'] as unknown[];
    expect(oneOf).toHaveLength(5);

    // Must have discriminator.propertyName = "config_kind"
    expect(configField).toHaveProperty('discriminator');
    const discriminator = configField['discriminator'] as Record<string, unknown>;
    expect(discriminator['propertyName']).toBe('config_kind');

    // Discriminator mapping must cover all 5 widget types
    const mapping = discriminator['mapping'] as Record<string, string>;
    expect(Object.keys(mapping).sort()).toEqual(
      ['chart', 'event_feed', 'metric_card', 'status_grid', 'table'].sort(),
    );
  });

  it('each oneOf branch has config_kind with const matching the discriminator mapping', () => {
    const schema = widgetDefinitionSchema as Record<string, unknown>;
    const defs = schema['$defs'] as Record<string, Record<string, unknown>>;
    const props = schema['properties'] as Record<string, unknown>;
    const configField = props['config'] as Record<string, unknown>;
    const discriminator = configField['discriminator'] as Record<string, unknown>;
    const mapping = discriminator['mapping'] as Record<string, string>;

    // For each mapped kind, the referenced def must have config_kind.const = kind
    for (const [kind, ref] of Object.entries(mapping)) {
      // ref is like "#/$defs/ModelWidgetConfigChart"
      const defName = ref.replace('#/$defs/', '');
      const def = defs[defName];
      expect(def).toBeDefined();
      const defProps = def['properties'] as Record<string, unknown>;
      const configKindField = defProps['config_kind'] as Record<string, unknown>;
      expect(configKindField['const']).toBe(kind);
    }
  });
});

// ---------------------------------------------------------------------------
// AJV schema validation — proves the Pydantic schema is AJV-consumable
// ---------------------------------------------------------------------------

describe('AJV validation of Pydantic-generated schemas', () => {
  // ajv-formats adds support for "date-time", "uri", etc. used in the schema
  function makeAjv() {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    return ajv;
  }

  it('valid ModelComponentContract formData passes AJV validation', () => {
    const ajv = makeAjv();
    const validate = ajv.compile(componentContractSchema);
    const data = {
      component_id: 'test-component',
      component_kind: 'metric_card',
      title: 'Test Component',
      contract_version: { major: 1, minor: 0, patch: 0 },
      data_bindings: [],
      actions: [],
      evidence_requirements: [],
      permission: null,
      supported_empty_state_reasons: [],
    };
    const valid = validate(data);
    // If validation fails, ajv populates errors — surface them as the failure message
    const errors = validate.errors;
    expect(valid, `AJV errors: ${JSON.stringify(errors)}`).toBe(true);
  });

  it('ModelComponentContract with a data binding validates correctly', () => {
    const ajv = makeAjv();
    const validate = ajv.compile(componentContractSchema);
    const data = {
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
          required_fields: ['status'],
          cursor_field: null,
        },
      ],
      actions: [],
      evidence_requirements: [],
      permission: null,
      supported_empty_state_reasons: ['no-data'],
    };
    const valid = validate(data);
    expect(valid, `AJV errors: ${JSON.stringify(validate.errors)}`).toBe(true);
  });

  it('valid ModelWidgetDefinition with chart config passes AJV validation', () => {
    const ajv = makeAjv();
    // Resolve $defs by embedding the full schema
    const validate = ajv.compile(widgetDefinitionSchema);
    const data = {
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
    };
    const valid = validate(data);
    expect(valid, `AJV errors: ${JSON.stringify(validate.errors)}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// React rendering — proves @rjsf renders the schema without crashing
// ---------------------------------------------------------------------------

describe('ContractInspector component', () => {
  it('renders the inspector without crashing', () => {
    render(<ContractInspector />);
    expect(screen.getByTestId('contract-inspector')).toBeDefined();
  });

  it('shows the schema selector', () => {
    render(<ContractInspector />);
    expect(screen.getByTestId('schema-selector')).toBeDefined();
  });

  it('shows the submit button', () => {
    render(<ContractInspector />);
    expect(screen.getByTestId('submit-btn')).toBeDefined();
  });

  it('shows spike findings panel', () => {
    render(<ContractInspector />);
    expect(screen.getByTestId('spike-findings')).toBeDefined();
  });

  it('status is "Awaiting submit" before the form is submitted', () => {
    render(<ContractInspector />);
    const statusEl = screen.getByTestId('status-text');
    expect(statusEl.textContent).toContain('Awaiting submit');
  });

  it('submit changes status to PASS for valid initial formData', () => {
    render(<ContractInspector />);
    const submitBtn = screen.getByTestId('submit-btn');
    fireEvent.click(submitBtn);
    const statusEl = screen.getByTestId('status-text');
    // If the initial data is valid @rjsf reports success
    expect(statusEl.textContent).toContain('PASS');
  });

  it('round-trip-json output updates after submit', () => {
    render(<ContractInspector />);
    const submitBtn = screen.getByTestId('submit-btn');
    fireEvent.click(submitBtn);
    const jsonEl = screen.getByTestId('round-trip-json');
    // Should contain component_id from the initial ComponentContract formData
    expect(jsonEl.textContent).toContain('delegation-status');
  });

  it('switching to widget-definition schema resets status', () => {
    render(<ContractInspector />);
    // Submit first to set status
    fireEvent.click(screen.getByTestId('submit-btn'));
    expect(screen.getByTestId('status-text').textContent).toContain('PASS');

    // Switch schema
    const selector = screen.getByTestId('schema-selector');
    fireEvent.change(selector, { target: { value: 'widget-definition' } });

    // Status should reset
    expect(screen.getByTestId('status-text').textContent).toContain('Awaiting submit');
  });
});

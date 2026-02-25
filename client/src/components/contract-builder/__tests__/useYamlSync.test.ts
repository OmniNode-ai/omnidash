/**
 * Tests for useYamlSync hook
 *
 * Covers:
 * - serializeToYaml: form data → YAML conversion
 * - parseYaml: YAML → form data parsing
 * - Round-trip: form → YAML → form produces identical output
 * - Invalid YAML returns null (form state not corrupted)
 * - Schema constraint rendering (required, enum, min/max, description)
 *
 * OMN-2541 acceptance criteria:
 * - Round-trip (form → YAML → form) produces byte-identical output for all schema types
 * - Invalid YAML in raw editor does not corrupt form state
 */

import { describe, it, expect } from 'vitest';
import { serializeToYaml, parseYaml } from '../useYamlSync';
import type { RJSFSchema } from '@rjsf/utils';

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const flatSchema: RJSFSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name', description: 'Node name' },
    version: { type: 'string', title: 'Version' },
    enabled: { type: 'boolean', title: 'Enabled' },
    count: { type: 'number', title: 'Count', minimum: 0, maximum: 100 },
    mode: {
      type: 'string',
      enum: ['DETERMINISTIC', 'NONDETERMINISTIC', 'BOUNDED_NONDETERMINISTIC'],
    },
  },
  required: ['name', 'version'],
};

const nestedSchema: RJSFSchema = {
  type: 'object',
  properties: {
    node_identity: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
    metadata: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const arraySchema: RJSFSchema = {
  type: 'object',
  properties: {
    effects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          target: { type: 'string' },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// serializeToYaml
// ---------------------------------------------------------------------------

describe('serializeToYaml', () => {
  it('converts a flat form object to YAML', () => {
    const data = {
      name: 'my-node',
      version: '1.0.0',
      enabled: true,
      count: 5,
      mode: 'DETERMINISTIC',
    };
    const yaml = serializeToYaml(data, flatSchema);
    expect(yaml).toContain('name: my-node');
    expect(yaml).toContain('version: 1.0.0');
    expect(yaml).toContain('enabled: true');
    expect(yaml).toContain('count: 5');
    expect(yaml).toContain('mode: DETERMINISTIC');
  });

  it('includes skeleton keys for empty/null fields', () => {
    const data = { name: 'test' };
    const yaml = serializeToYaml(data, flatSchema);
    // Keys defined in schema should appear even if not in form data
    expect(yaml).toContain('version:');
    expect(yaml).toContain('enabled:');
    expect(yaml).toContain('count:');
    expect(yaml).toContain('mode:');
  });

  it('serializes nested objects', () => {
    const data = {
      node_identity: { name: 'my-effect', version: '2.0.0' },
      metadata: { displayName: 'My Effect', description: 'Does stuff', tags: ['onex', 'effect'] },
    };
    const yaml = serializeToYaml(data, nestedSchema);
    expect(yaml).toContain('node_identity:');
    expect(yaml).toContain('name: my-effect');
    expect(yaml).toContain('version: 2.0.0');
    expect(yaml).toContain('metadata:');
    expect(yaml).toContain('displayName: My Effect');
    expect(yaml).toContain('- onex');
    expect(yaml).toContain('- effect');
  });

  it('serializes arrays', () => {
    const data = {
      effects: [
        { type: 'kafka', target: 'agent-actions' },
        { type: 'db', target: 'postgres' },
      ],
    };
    const yaml = serializeToYaml(data, arraySchema);
    expect(yaml).toContain('effects:');
    expect(yaml).toContain('type: kafka');
    expect(yaml).toContain('target: agent-actions');
    expect(yaml).toContain('type: db');
    expect(yaml).toContain('target: postgres');
  });

  it('returns empty arrays for array schema fields with no data', () => {
    const data = {};
    const yaml = serializeToYaml(data, arraySchema);
    // effects should be present as an empty array
    expect(yaml).toContain('effects: []');
  });
});

// ---------------------------------------------------------------------------
// parseYaml
// ---------------------------------------------------------------------------

describe('parseYaml', () => {
  it('parses valid YAML to an object', () => {
    const yaml = 'name: test\nversion: 1.0.0\nenabled: true\n';
    const result = parseYaml(yaml);
    expect(result).toEqual({ name: 'test', version: '1.0.0', enabled: true });
  });

  it('returns null for invalid YAML syntax', () => {
    const badYaml = 'name: [unclosed bracket\nversion: 1.0.0\n';
    const result = parseYaml(badYaml);
    expect(result).toBeNull();
  });

  it('returns null for YAML that is not an object at root', () => {
    const listYaml = '- item1\n- item2\n';
    const result = parseYaml(listYaml);
    expect(result).toBeNull();
  });

  it('returns null for a plain scalar', () => {
    const scalar = 'just a string';
    const result = parseYaml(scalar);
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseYaml('');
    expect(result).toBeNull();
  });

  it('parses nested YAML', () => {
    const yaml = 'node_identity:\n  name: my-node\n  version: 2.0.0\n';
    const result = parseYaml(yaml);
    expect(result).toEqual({ node_identity: { name: 'my-node', version: '2.0.0' } });
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests (OMN-2541: form → YAML → form produces byte-identical output)
// ---------------------------------------------------------------------------

describe('round-trip (form → YAML → form)', () => {
  it('flat schema round-trip is byte-identical', () => {
    const original = {
      name: 'fetch-api-effect',
      version: '1.2.3',
      enabled: false,
      count: 42,
      mode: 'NONDETERMINISTIC',
    };
    const yaml = serializeToYaml(original, flatSchema);
    const parsed = parseYaml(yaml);
    expect(parsed).not.toBeNull();
    // Re-serialize parsed result
    const yaml2 = serializeToYaml(parsed as Record<string, unknown>, flatSchema);
    // The two YAML strings must be identical
    expect(yaml2).toBe(yaml);
  });

  it('nested schema round-trip is byte-identical', () => {
    const original = {
      node_identity: { name: 'my-reducer', version: '3.0.0' },
      metadata: {
        displayName: 'My Reducer',
        description: 'Aggregates events',
        tags: ['reducer', 'v3'],
      },
    };
    const yaml = serializeToYaml(original, nestedSchema);
    const parsed = parseYaml(yaml);
    expect(parsed).not.toBeNull();
    const yaml2 = serializeToYaml(parsed as Record<string, unknown>, nestedSchema);
    expect(yaml2).toBe(yaml);
  });

  it('array schema round-trip is byte-identical', () => {
    const original = {
      effects: [
        { type: 'kafka', target: 'agent-actions' },
        { type: 'pg', target: 'omnibase_infra' },
      ],
    };
    const yaml = serializeToYaml(original, arraySchema);
    const parsed = parseYaml(yaml);
    expect(parsed).not.toBeNull();
    const yaml2 = serializeToYaml(parsed as Record<string, unknown>, arraySchema);
    expect(yaml2).toBe(yaml);
  });

  it('empty data round-trip is byte-identical', () => {
    const original = {};
    const yaml = serializeToYaml(original, flatSchema);
    const parsed = parseYaml(yaml);
    expect(parsed).not.toBeNull();
    const yaml2 = serializeToYaml(parsed as Record<string, unknown>, flatSchema);
    expect(yaml2).toBe(yaml);
  });
});

// ---------------------------------------------------------------------------
// Invalid YAML does not corrupt form state
// ---------------------------------------------------------------------------

describe('invalid YAML does not corrupt form state', () => {
  it('parseYaml returns null (not a corrupted object) for syntax errors', () => {
    const syntaxErrors = [
      'key: [unclosed',
      'key: {unclosed',
      'key:\n  - item\n    bad indent: here: extra colon: issues',
      '\t\tinvalid tabs at start',
    ];

    for (const bad of syntaxErrors) {
      const result = parseYaml(bad);
      // Must be null — never a partial/corrupted object
      // (caller must check for null before updating form state)
      expect(result).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Schema constraint types (OMN-2541: all constraint types rendered)
// ---------------------------------------------------------------------------

describe('schema constraint types in serialization', () => {
  it('handles enum fields', () => {
    const data = { mode: 'DETERMINISTIC' };
    const yaml = serializeToYaml(data, flatSchema);
    expect(yaml).toContain('mode: DETERMINISTIC');
  });

  it('handles boolean fields', () => {
    const data = { enabled: true };
    const yaml = serializeToYaml(data, flatSchema);
    expect(yaml).toContain('enabled: true');
  });

  it('handles numeric fields', () => {
    const data = { count: 77 };
    const yaml = serializeToYaml(data, flatSchema);
    expect(yaml).toContain('count: 77');
  });

  it('handles null values as "null" (not "~")', () => {
    const data = { name: null };
    const yaml = serializeToYaml(data as unknown as Record<string, unknown>, flatSchema);
    expect(yaml).toContain('name: null');
    expect(yaml).not.toContain('name: ~');
  });
});

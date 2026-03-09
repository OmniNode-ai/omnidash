#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Schema Parity Validator (OMN-4298)
 *
 * Validates that omnidash TypeScript type definitions include all required fields
 * from the canonical Pydantic event models exported by export-event-schemas.py.
 *
 * Consumes the JSON Schema export produced by:
 *   uv run python scripts/export-event-schemas.py --output /tmp/event-schemas.json
 *
 * Usage:
 *   npx tsx scripts/validate-schema-parity.ts --schemas /tmp/event-schemas.json
 *
 * Exit codes:
 *   0 -- all required fields are covered (or there are no required fields to check)
 *   1 -- one or more required fields are missing from TypeScript coverage
 *   2 -- argument or file-loading error
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { schemasPath: string } {
  const args = process.argv.slice(2);
  let schemasPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--schemas' && i + 1 < args.length) {
      schemasPath = args[i + 1];
      i++;
    }
  }

  if (!schemasPath) {
    console.error('Usage: npx tsx scripts/validate-schema-parity.ts --schemas <path>');
    process.exit(2);
  }

  return { schemasPath };
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface JsonSchemaModel {
  title?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

interface SchemaExport {
  version: string;
  source: string;
  model_count: number;
  models: Record<string, JsonSchemaModel>;
}

// ---------------------------------------------------------------------------
// TypeScript source coverage scan
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts files under a directory, excluding node_modules
 * and __tests__ directories.
 */
function collectTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Build a field-coverage index from TypeScript source files.
 *
 * For each .ts file, extract all identifiers (property names, type keys,
 * interface field names) that appear as camelCase or snake_case tokens.
 * This is a conservative heuristic: if a field name appears anywhere in
 * the TypeScript source, we consider it "covered".
 *
 * We match both the original snake_case field name AND the camelCase
 * equivalent, since TypeScript types often use camelCase while Python
 * uses snake_case.
 */
function buildCoverageIndex(tsFiles: string[]): Set<string> {
  const covered = new Set<string>();

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Extract identifiers: camelCase, snake_case, PascalCase tokens
    // Matches property names in object types, interfaces, and Zod schemas
    const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = identifierRegex.exec(content)) !== null) {
      covered.add(match[1]);
    }
  }

  return covered;
}

/**
 * Convert snake_case to camelCase.
 *
 * Python Pydantic models use snake_case; TypeScript often uses camelCase.
 * We accept either form as "covered".
 */
function snakeToCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, char: string) => (char as string).toUpperCase());
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

interface ValidationResult {
  modelName: string;
  requiredFields: string[];
  missingFields: string[];
  coveredFields: string[];
  passed: boolean;
}

function validateModel(
  modelName: string,
  schema: JsonSchemaModel,
  coverage: Set<string>
): ValidationResult {
  const required = schema.required ?? [];
  const missing: string[] = [];
  const covered: string[] = [];

  for (const field of required) {
    const camel = snakeToCamel(field);
    if (coverage.has(field) || coverage.has(camel)) {
      covered.push(field);
    } else {
      missing.push(field);
    }
  }

  return {
    modelName,
    requiredFields: required,
    missingFields: missing,
    coveredFields: covered,
    passed: missing.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { schemasPath } = parseArgs();

  // Load schema export
  if (!fs.existsSync(schemasPath)) {
    console.error(`ERROR: Schema file not found: ${schemasPath}`);
    process.exit(2);
  }

  let schemaExport: SchemaExport;
  try {
    const raw = fs.readFileSync(schemasPath, 'utf-8');
    schemaExport = JSON.parse(raw) as SchemaExport;
  } catch (err) {
    console.error(`ERROR: Failed to parse schema file: ${err}`);
    process.exit(2);
  }

  if (!schemaExport.models || typeof schemaExport.models !== 'object') {
    console.error('ERROR: Schema export missing "models" key');
    process.exit(2);
  }

  console.log('\nSchema Parity Validator (OMN-4298)');
  console.log(`Source: ${schemaExport.source} (${schemaExport.model_count} models)`);
  console.log(`Schema file: ${schemasPath}`);
  console.log('');

  // Collect TypeScript source files from shared/ and server/
  const sharedDir = path.join(process.cwd(), 'shared');
  const serverDir = path.join(process.cwd(), 'server');

  const tsFiles: string[] = [];
  if (fs.existsSync(sharedDir)) tsFiles.push(...collectTypeScriptFiles(sharedDir));
  if (fs.existsSync(serverDir)) tsFiles.push(...collectTypeScriptFiles(serverDir));

  console.log(`TypeScript coverage: scanning ${tsFiles.length} files`);
  console.log('  Directories: shared/, server/');
  console.log('');

  const coverage = buildCoverageIndex(tsFiles);

  // Validate each model
  const results: ValidationResult[] = [];
  for (const [modelName, schema] of Object.entries(schemaExport.models)) {
    const result = validateModel(modelName, schema, coverage);
    results.push(result);
  }

  // Report
  let totalMissing = 0;
  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const fieldSummary =
      result.requiredFields.length > 0
        ? `${result.coveredFields.length}/${result.requiredFields.length} required fields covered`
        : 'no required fields';

    console.log(`[${status}] ${result.modelName} -- ${fieldSummary}`);

    if (!result.passed) {
      failCount++;
      totalMissing += result.missingFields.length;
      for (const field of result.missingFields) {
        const camel = snakeToCamel(field);
        console.log(`       MISSING: ${field} (also checked camelCase: ${camel})`);
      }
    } else {
      passCount++;
      if (result.requiredFields.length > 0) {
        console.log(`       Covered: ${result.coveredFields.join(', ')}`);
      }
    }
  }

  console.log('');
  console.log(
    `Results: ${passCount} passed, ${failCount} failed, ${totalMissing} missing fields total`
  );

  if (failCount > 0) {
    console.log('');
    console.error(
      `FAILURE: ${failCount} model(s) have required fields not found in TypeScript source.`
    );
    console.error(
      'Add the missing field names to the corresponding TypeScript type definitions'
    );
    console.error(
      'in shared/ or server/, or add them to the Zod schemas in shared/event-schemas.ts.'
    );
    process.exit(1);
  }

  console.log('OK: All required Pydantic event model fields are covered in TypeScript source.');
}

main();

import { REQUIRED_TOKENS, validateThemeDefinition, type ThemeDefinition } from './types';

export { REQUIRED_TOKENS };

const KNOWN_OPTIONAL_TOKENS = ['font-sans', 'font-mono', 'radius-sm', 'radius-md', 'radius-lg'] as const;
const ALL_KNOWN_TOKENS = new Set<string>([...REQUIRED_TOKENS, ...KNOWN_OPTIONAL_TOKENS]);

export interface ImportResult {
  valid: boolean;
  theme?: ThemeDefinition;
  errors: string[];
  warnings: string[];
}

export function exportTheme(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

export function importTheme(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, errors: ['Invalid JSON format'], warnings: [] };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Theme must be a JSON object'], warnings: [] };
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.name !== 'string' || typeof obj.themeSchemaVersion !== 'string' || typeof obj.tokens !== 'object' || !obj.tokens) {
    return { valid: false, errors: ['Theme must have name, themeSchemaVersion, and tokens'], warnings: [] };
  }

  const rawTokens = obj.tokens as Record<string, string>;
  const warnings: string[] = [];

  // Strip unknown token keys
  const cleanedTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawTokens)) {
    if (ALL_KNOWN_TOKENS.has(key)) {
      cleanedTokens[key] = value;
    } else {
      warnings.push(`Stripped unknown token: ${key}`);
    }
  }

  const theme: ThemeDefinition = {
    name: obj.name as string,
    author: (obj.author as string) || 'unknown',
    themeSchemaVersion: obj.themeSchemaVersion as string,
    version: (obj.version as string) || '1.0.0',
    tokens: cleanedTokens,
  };

  const validation = validateThemeDefinition(theme);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, warnings };
  }

  return { valid: true, theme, errors: [], warnings };
}

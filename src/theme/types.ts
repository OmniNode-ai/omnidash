export const REQUIRED_TOKENS = [
  'background', 'foreground', 'card', 'border', 'primary', 'muted', 'accent', 'destructive',
  'status-healthy', 'status-warning', 'status-error',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7',
] as const;

export type RequiredToken = (typeof REQUIRED_TOKENS)[number];

export type KnownOptionalToken = 'font-sans' | 'font-mono' | 'radius-sm' | 'radius-md' | 'radius-lg';

export interface ThemeDefinition {
  name: string;
  author: string;
  themeSchemaVersion: string;
  version: string;
  /** Required tokens are enforced by `validateThemeDefinition`. Optional known tokens are listed in `KnownOptionalToken`. Extra keys beyond these will be stripped on import. */
  tokens: Partial<Record<RequiredToken, string>> & Partial<Record<KnownOptionalToken, string>> & Record<string, string>;
}

export interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
}

const HSL_PATTERN = /^\d{1,3}\s+\d{1,3}%?\s+\d{1,3}%?$/;

export function validateThemeDefinition(theme: ThemeDefinition): ThemeValidationResult {
  const errors: string[] = [];

  for (const token of REQUIRED_TOKENS) {
    if (!(token in theme.tokens)) {
      errors.push(`Missing required token: ${token}`);
    } else if (!HSL_PATTERN.test(theme.tokens[token])) {
      errors.push(`Invalid HSL value for token "${token}": ${theme.tokens[token]}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

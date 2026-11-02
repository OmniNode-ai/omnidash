export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'ok' | 'warn' | 'bad' | 'inherit';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextLeading = 'tight' | 'normal' | 'loose';
export type TextFamily = 'sans' | 'mono';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type TextAlign = 'start' | 'center' | 'end';

export const SIZE_VAR: Record<TextSize, string> = {
  xs: 'var(--ds-text-xs)', sm: 'var(--ds-text-sm)', md: 'var(--ds-text-md)',
  lg: 'var(--ds-text-lg)', xl: 'var(--ds-text-xl)', '2xl': 'var(--ds-text-2xl)',
  '3xl': 'var(--ds-text-3xl)', '4xl': 'var(--ds-text-4xl)',
};
export const COLOR_VAR: Record<TextColor, string> = {
  primary: 'var(--ds-ink)', secondary: 'var(--ds-ink-2)',
  tertiary: 'var(--ds-ink-3)', brand: 'var(--ds-brand)',
  ok: 'var(--ds-ok)', warn: 'var(--ds-warn)', bad: 'var(--ds-bad)',
  inherit: 'inherit',
};
export const WEIGHT_VAR: Record<TextWeight, string> = {
  regular: 'var(--ds-weight-regular)', medium: 'var(--ds-weight-medium)',
  semibold: 'var(--ds-weight-semibold)', bold: 'var(--ds-weight-bold)',
};
export const LEADING_VAR: Record<TextLeading, string> = {
  tight: 'var(--ds-leading-tight)', normal: 'var(--ds-leading-normal)', loose: 'var(--ds-leading-loose)',
};
export const FAMILY_VAR: Record<TextFamily, string> = {
  sans: 'var(--ds-font-sans)', mono: 'var(--ds-font-mono)',
};

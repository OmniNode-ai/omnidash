export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type TextColor = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'ok' | 'warn' | 'bad' | 'inherit';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextLeading = 'tight' | 'normal' | 'loose';
export type TextFamily = 'sans' | 'mono';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type TextAlign = 'start' | 'center' | 'end';

export const SIZE_VAR: Record<TextSize, string> = {
  xs: 'var(--text-xs)', sm: 'var(--text-sm)', md: 'var(--text-md)',
  lg: 'var(--text-lg)', xl: 'var(--text-xl)', '2xl': 'var(--text-2xl)',
  '3xl': 'var(--text-3xl)', '4xl': 'var(--text-4xl)',
};
export const COLOR_VAR: Record<TextColor, string> = {
  primary: 'var(--text-primary)', secondary: 'var(--text-secondary)',
  tertiary: 'var(--text-tertiary)', brand: 'var(--text-brand)',
  ok: 'var(--text-ok)', warn: 'var(--text-warn)', bad: 'var(--text-bad)',
  inherit: 'inherit',
};
export const WEIGHT_VAR: Record<TextWeight, string> = {
  regular: 'var(--weight-regular)', medium: 'var(--weight-medium)',
  semibold: 'var(--weight-semibold)', bold: 'var(--weight-bold)',
};
export const LEADING_VAR: Record<TextLeading, string> = {
  tight: 'var(--leading-tight)', normal: 'var(--leading-normal)', loose: 'var(--leading-loose)',
};
export const FAMILY_VAR: Record<TextFamily, string> = {
  sans: 'var(--font-sans)', mono: 'var(--font-mono)',
};

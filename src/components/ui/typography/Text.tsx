import React from 'react';
import {
  SIZE_VAR, COLOR_VAR, WEIGHT_VAR, LEADING_VAR, FAMILY_VAR,
  type TextSize, type TextColor, type TextWeight, type TextLeading,
  type TextFamily, type TextTransform, type TextAlign,
} from './tokens';

export interface TextProps {
  /** Maps to --text-* scale. Default 'xl' (14px body). */
  size?: TextSize;
  /** Semantic color role. Default 'primary'. */
  color?: TextColor;
  /** Font weight. Default 'regular'. */
  weight?: TextWeight;
  /** Line-height preset. Default 'normal'. */
  leading?: TextLeading;
  /** 'sans' for UI chrome, 'mono' for data. Default 'sans'. */
  family?: TextFamily;
  /** Letter-case / decoration. Default 'none'. */
  transform?: TextTransform;
  /** Text alignment. Default 'start'. */
  align?: TextAlign;
  /** Adds font-variant-numeric: tabular-nums. */
  tabularNums?: boolean;
  /** Adds overflow/ellipsis/nowrap. */
  truncate?: boolean;
  /** Rendered element. Default 'span'. */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  /** Merged OVER computed token styles (escape hatch). */
  style?: React.CSSProperties;
  id?: string;
  title?: string;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
  children: React.ReactNode;
}

export function Text({
  size = 'xl',
  color = 'primary',
  weight = 'regular',
  leading = 'normal',
  family = 'sans',
  transform = 'none',
  align = 'start',
  tabularNums = false,
  truncate = false,
  as = 'span',
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const computed: React.CSSProperties = {
    fontSize: SIZE_VAR[size],
    color: COLOR_VAR[color],
    fontWeight: WEIGHT_VAR[weight],
    lineHeight: LEADING_VAR[leading],
    fontFamily: FAMILY_VAR[family],
  };
  if (transform !== 'none') computed.textTransform = transform;
  if (align !== 'start') computed.textAlign = align;
  if (tabularNums) computed.fontVariantNumeric = 'tabular-nums';
  if (truncate) {
    computed.overflow = 'hidden';
    computed.textOverflow = 'ellipsis';
    computed.whiteSpace = 'nowrap';
  }
  // style prop wins: it's the escape hatch for one-off overrides.
  const merged = style ? { ...computed, ...style } : computed;
  return React.createElement(as, { className, style: merged, ...rest }, children);
}

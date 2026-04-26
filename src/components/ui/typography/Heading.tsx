import React from 'react';
import {
  SIZE_VAR, COLOR_VAR, WEIGHT_VAR, LEADING_VAR,
  type TextSize, type TextColor, type TextWeight, type TextLeading,
  type TextTransform, type TextAlign,
} from './tokens';

const LEVEL_DEFAULT_SIZE: Record<1 | 2 | 3 | 4, TextSize> = {
  1: '4xl', 2: '3xl', 3: '2xl', 4: 'xl',
};

export interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  size?: TextSize;
  color?: TextColor;
  weight?: TextWeight;
  leading?: TextLeading;
  transform?: TextTransform;
  align?: TextAlign;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children: React.ReactNode;
}

export function Heading({
  level,
  size,
  color = 'primary',
  weight = 'semibold',
  leading = 'tight',
  transform = 'none',
  align = 'start',
  className,
  style,
  children,
  ...rest
}: HeadingProps) {
  const effectiveSize = size ?? LEVEL_DEFAULT_SIZE[level];
  const computed: React.CSSProperties = {
    fontSize: SIZE_VAR[effectiveSize],
    color: COLOR_VAR[color],
    fontWeight: WEIGHT_VAR[weight],
    lineHeight: LEADING_VAR[leading],
  };
  if (transform !== 'none') computed.textTransform = transform;
  if (align !== 'start') computed.textAlign = align;
  const merged = style ? { ...computed, ...style } : computed;
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return React.createElement(Tag, { className, style: merged, ...rest }, children);
}

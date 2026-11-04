/**
 * OMN-22168: the colours of a three.js chart scene and its HTML overlay, from the design tokens. Both cost-trend 3D
 * charts read this instead of carrying their own neon and pastel skins, so a 3D chart sits in the same 01 + 20 look as
 * every other chart and follows the theme. Scene colours are numbers for THREE.Color; overlay colours are CSS strings;
 * the series are "#rrggbb" so a legend chip can add a hex alpha. Opacities stay with each chart: they are not colours.
 */
import { useMemo } from 'react';
import { CHART_SERIES, tokenHex, tokenNumber, useTokenRevision } from '../color';

export interface SceneColours {
  sceneBg: number;
  fog: number;
  floor: number;
  grid: number;
  isolatedDimColor: number;
  modelPalette: string[];
  labelPrimary: string;
  labelSecondary: string;
  labelShadow: string;
  scrollbarAccent: string;
  panelBg: string;
  panelBorder: string;
  panelHeader: string;
  panelText: string;
  panelSubtle: string;
  chipBorder: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipSubtle: string;
  tooltipValue: string;
}

export function readSceneColours(): SceneColours {
  return {
    sceneBg: tokenNumber('--ds-page'),
    fog: tokenNumber('--ds-page'),
    floor: tokenNumber('--ds-surface'),
    grid: tokenNumber('--ds-line-strong'),
    isolatedDimColor: tokenNumber('--ds-ink-4'),
    modelPalette: CHART_SERIES.map(tokenHex),
    labelPrimary: 'var(--ds-ink-2)',
    labelSecondary: 'var(--ds-ink-3)',
    labelShadow: 'none',
    scrollbarAccent: 'var(--ds-ink-3)',
    panelBg: 'color-mix(in srgb, var(--ds-overlay) 92%, transparent)',
    panelBorder: 'var(--ds-line)',
    panelHeader: 'var(--ds-ink)',
    panelText: 'var(--ds-ink-2)',
    panelSubtle: 'var(--ds-ink-3)',
    chipBorder: 'var(--ds-line)',
    tooltipBg: 'var(--ds-overlay)',
    tooltipText: 'var(--ds-ink)',
    tooltipSubtle: 'var(--ds-ink-3)',
    tooltipValue: 'var(--ds-ink)',
  };
}

/** The scene colours for the current theme; re-read when the theme changes. */
export function useSceneColours(): SceneColours {
  const revision = useTokenRevision();
  return useMemo(readSceneColours, [revision]);
}

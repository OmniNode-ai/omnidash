import { describe, it, expect } from 'vitest';
import { pickComponentForHint } from './hint-matcher';
import { EnumDashboardWidgetType } from '../shared/types/generated/enum-dashboard-widget-type';

const makeComponent = (name: string, category: string) => ({
  manifest: { name, category },
});

describe('pickComponentForHint', () => {
  // ── All 5 widget types with a direct match ───────────────────────────────

  it('returns a visualization component for Chart', () => {
    const available = [makeComponent('LineChart', 'visualization')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Chart }, available),
    ).toBe('LineChart');
  });

  it('returns a table component for Table', () => {
    const available = [makeComponent('DataTable', 'table')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Table }, available),
    ).toBe('DataTable');
  });

  it('returns a metrics component for Tile', () => {
    const available = [makeComponent('MetricTile', 'metrics')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Tile }, available),
    ).toBe('MetricTile');
  });

  it('returns a stream component for List', () => {
    const available = [makeComponent('EventStream', 'stream')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.List }, available),
    ).toBe('EventStream');
  });

  it('returns a metrics component for Scalar', () => {
    const available = [makeComponent('ScalarKPI', 'metrics')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Scalar }, available),
    ).toBe('ScalarKPI');
  });

  // ── No match → null fallback ─────────────────────────────────────────────

  it('returns null when available list is empty', () => {
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Chart }, []),
    ).toBeNull();
  });

  it('returns null when no component matches any preferred category', () => {
    const available = [makeComponent('OtherWidget', 'some-unknown-category')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Chart }, available),
    ).toBeNull();
  });

  // ── Category-priority: first preferred wins ──────────────────────────────

  it('prefers first category (visualization) over second (metrics) for Chart', () => {
    const available = [
      makeComponent('MetricBar', 'metrics'),
      makeComponent('LineChart', 'visualization'),
    ];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Chart }, available),
    ).toBe('LineChart');
  });

  it('prefers first category (metrics) over second (status) for Tile', () => {
    const available = [
      makeComponent('StatusBadge', 'status'),
      makeComponent('MetricTile', 'metrics'),
    ];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Tile }, available),
    ).toBe('MetricTile');
  });

  it('prefers first category (stream) over second (status) for List', () => {
    const available = [
      makeComponent('StatusBadge', 'status'),
      makeComponent('EventStream', 'stream'),
    ];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.List }, available),
    ).toBe('EventStream');
  });

  // ── Falls back to next preferred when first is absent ───────────────────

  it('falls back to metrics when visualization is absent (Chart)', () => {
    const available = [makeComponent('MetricBar', 'metrics')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Chart }, available),
    ).toBe('MetricBar');
  });

  it('falls back to status when metrics is absent (Tile)', () => {
    const available = [makeComponent('StatusBadge', 'status')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.Tile }, available),
    ).toBe('StatusBadge');
  });

  it('falls back to status when stream is absent (List)', () => {
    const available = [makeComponent('StatusBadge', 'status')];
    expect(
      pickComponentForHint({ widget_type: EnumDashboardWidgetType.List }, available),
    ).toBe('StatusBadge');
  });
});

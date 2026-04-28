/**
 * Shared types for the merged 2D/3D widget pattern. The three consolidated
 * widgets (Cost Trend, Cost by Model, Quality Scores) each route between
 * sub-components based on a `dimension` config field; this is the single
 * source of truth for that union.
 */
export type WidgetDimension = '2d' | '3d';

// 2D stacked-area chart rendered via three.js on an orthographic camera
// whose frustum matches canvas pixel coordinates (top-left origin, y-down).
// Replaces an ECharts-backed implementation whose hover/emphasis model
// produced intermittent flicker on stacked areas; owning the render loop
// gives us full control over hover and tooltip behavior.
//
// Scope: filled bands + top-edge lines + horizontal grid + axis labels +
// hover guide + tooltip. No animations, no zoom/pan. Re-renders on
// size/data/theme changes only — no rAF loop.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThemeColors } from '@/theme';

// Parse any CSS color string — including modern color functions like
// oklch() / lab() / color-mix() that THREE.Color.setStyle() doesn't
// understand — into a numeric sRGB hex. We use a hidden 1×1 canvas:
// Canvas 2D's fillStyle setter accepts the full CSS color syntax and
// the browser normalizes it for us when we read the pixel back.
// Without this conversion, our --chart-* tokens (which are defined as
// oklch() in globals.css) all fell back to neutral grey inside THREE.
function cssColorToHex(cssValue: string | undefined, fallback = 0x888888): number {
  if (!cssValue || typeof document === 'undefined') return fallback;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    // Seed with an unusual sentinel: Canvas 2D's fillStyle setter
    // silently ignores invalid colors and retains the previous value,
    // so we test whether the setter accepted `cssValue` by comparing
    // the normalized read-back.
    const sentinel = '#fe00fd';
    ctx.fillStyle = sentinel;
    ctx.fillStyle = cssValue;
    const normalized = (ctx.fillStyle as string).toLowerCase();
    if (normalized === sentinel) return fallback;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return (d[0] << 16) | (d[1] << 8) | d[2];
  } catch {
    return fallback;
  }
}

// ---------- Types ----------

export interface StackedSlice {
  buckets: string[];              // ISO timestamps, ascending
  visibleModels: string[];        // models to render, stack-order (bottom to top)
  /** cumulative[bucketIdx][modelIdx] = cumulative cost including models[0..modelIdx]. */
  cumulative: number[][];
  /** perModelCost[model] = length-N array of raw (non-cumulative) cost per bucket. */
  perModelCost: Record<string, number[]>;
  /** Max of cumulative[*][visibleModels.length-1] across all buckets. */
  maxTotal: number;
}

interface StackedAreaChartProps {
  stacked: StackedSlice;
  /** Full model list — used for stable chart-color indexing independent of visibility. */
  allModels: string[];
  /** Formatter for the x-axis ticks; receives an ISO bucket timestamp. */
  formatBucketTick: (iso: string) => string;
  /** Pixel height of the chart area. Width inherits from parent. */
  height?: number;
}

// ---------- Layout constants ----------

const MARGIN = { top: 12, right: 12, bottom: 34, left: 62 };
const NUM_Y_TICKS = 5;
const MAX_X_TICKS = 6;
const BAND_OPACITY = 0.55;
const OUTLINE_OPACITY = 0.9;
const GRID_OPACITY = 0.22;

// ---------- Scale helpers ----------

interface Scales {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
  plotHeight: number;
  xForBucket: (i: number) => number;
  yForValue: (v: number) => number;
  valueForY: (y: number) => number;
}

function buildScales(width: number, height: number, numBuckets: number, maxTotal: number): Scales {
  const plotLeft = MARGIN.left;
  const plotRight = width - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = height - MARGIN.bottom;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);

  const xForBucket = (i: number) => {
    if (numBuckets <= 1) return plotLeft + plotWidth / 2;
    return plotLeft + (i / (numBuckets - 1)) * plotWidth;
  };
  // y=0 at plotBottom, y=maxTotal at plotTop. Screen y grows downward in our frustum.
  const yForValue = (v: number) => plotBottom - (v / maxTotal) * plotHeight;
  const valueForY = (y: number) => ((plotBottom - y) / plotHeight) * maxTotal;

  return {
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    xForBucket,
    yForValue,
    valueForY,
  };
}

function niceYTicks(maxValue: number, count: number): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0];
  // Rough "nice" tick stride — round the step to 1, 2, or 5 × 10^k.
  const rawStep = maxValue / Math.max(1, count - 1);
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const mult = rawStep / base;
  let niceMult: number;
  if (mult < 1.5) niceMult = 1;
  else if (mult < 3) niceMult = 2;
  else if (mult < 7) niceMult = 5;
  else niceMult = 10;
  const step = niceMult * base;
  const ticks: number[] = [];
  for (let v = 0; v <= maxValue + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

function bucketIndexStride(numBuckets: number, maxTicks: number): number {
  if (numBuckets <= maxTicks) return 1;
  return Math.ceil(numBuckets / maxTicks);
}

// ---------- Scene builders ----------

function buildBand(
  scales: Scales,
  stacked: StackedSlice,
  modelIdx: number,
  color: THREE.Color,
): THREE.Mesh {
  const N = stacked.buckets.length;
  const positions = new Float32Array(N * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = scales.xForBucket(i);
    const bottomCost = modelIdx === 0 ? 0 : stacked.cumulative[i][modelIdx - 1];
    const topCost = stacked.cumulative[i][modelIdx];
    const bottomY = scales.yForValue(bottomCost);
    const topY = scales.yForValue(topCost);
    positions[2 * i * 3] = x;
    positions[2 * i * 3 + 1] = bottomY;
    positions[2 * i * 3 + 2] = 0;
    positions[(2 * i + 1) * 3] = x;
    positions[(2 * i + 1) * 3 + 1] = topY;
    positions[(2 * i + 1) * 3 + 2] = 0;
  }
  for (let i = 0; i < N - 1; i++) {
    const b0 = 2 * i;
    const t0 = 2 * i + 1;
    const b1 = 2 * (i + 1);
    const t1 = 2 * (i + 1) + 1;
    indices.push(b0, t0, b1, t0, t1, b1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: BAND_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geom, mat);
}

function buildOutline(
  scales: Scales,
  stacked: StackedSlice,
  modelIdx: number,
  color: THREE.Color,
): THREE.Line {
  const N = stacked.buckets.length;
  const positions: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = scales.xForBucket(i);
    const y = scales.yForValue(stacked.cumulative[i][modelIdx]);
    // Small z offset so outlines draw above their fill band.
    positions.push(x, y, 0.01);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: OUTLINE_OPACITY }),
  );
}

function buildGrid(
  scales: Scales,
  yTicks: number[],
  color: THREE.Color,
): THREE.LineSegments {
  const positions: number[] = [];
  for (const v of yTicks) {
    const y = scales.yForValue(v);
    positions.push(scales.plotLeft, y, -0.01);
    positions.push(scales.plotRight, y, -0.01);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geom,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: GRID_OPACITY }),
  );
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    } else if (o instanceof THREE.Line || o instanceof THREE.LineSegments) {
      o.geometry?.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

// ---------- Component ----------

interface HoverInfo {
  bucketIdx: number;
  pointerClientX: number;
  pointerClientY: number;
}

export function StackedAreaChart({
  stacked, allModels, formatBucketTick, height = 320,
}: StackedAreaChartProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const dataGroupRef = useRef<THREE.Group | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const colors = useThemeColors();

  // Mount renderer + scene + camera once.
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'default',
      // We render on-demand rather than in a rAF loop — without
      // preserveDrawingBuffer the canvas can blank out on tab switch or
      // compositor reset since three.js assumes you'll redraw each frame.
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Frustum set in the resize effect — placeholder values here.
    const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
    camera.position.z = 0.5;
    cameraRef.current = camera;

    // ResizeObserver drives both canvas sizing and scene rebuilds.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(2, Math.floor(entry.contentRect.width));
        const h = Math.max(2, Math.floor(entry.contentRect.height));
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      if (dataGroupRef.current) {
        scene.remove(dataGroupRef.current);
        disposeObject3D(dataGroupRef.current);
        dataGroupRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Resolve theme-derived colors via the CSS-color parser above.
  // THREE.Color.setStyle doesn't understand oklch() (and our chart
  // tokens in globals.css are declared as oklch), so passing the raw
  // string from useThemeColors() silently falls through to neutral
  // grey on every band. cssColorToHex lets the browser do the parse
  // and gives us a clean sRGB hex.
  const themeColors = useMemo(
    () => ({
      grid: new THREE.Color(cssColorToHex(colors.border, 0x808088)),
      bandColors: allModels.map(
        (_m, i) => new THREE.Color(cssColorToHex(colors.chart[i % colors.chart.length])),
      ),
    }),
    [colors, allModels],
  );

  // Y-axis ticks + DOM positions for labels. Computed here because the
  // HTML overlay needs them too.
  const scales = useMemo(
    () => buildScales(size.w, size.h, stacked.buckets.length, stacked.maxTotal),
    [size, stacked],
  );
  const yTicks = useMemo(() => niceYTicks(stacked.maxTotal, NUM_Y_TICKS), [stacked]);
  const xTickStride = useMemo(
    () => bucketIndexStride(stacked.buckets.length, MAX_X_TICKS),
    [stacked.buckets.length],
  );

  // Rebuild the scene when data / size / theme changes. No animation —
  // render once after each rebuild.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (size.w < 2 || size.h < 2) return;

    renderer.setSize(size.w, size.h, false);
    // Frustum matches canvas pixel coordinates with the origin at the
    // top-left (y grows downward). Three.js's default is y-up, so we
    // flip top/bottom rather than post-transform the geometry.
    camera.left = 0;
    camera.right = size.w;
    camera.top = 0;
    camera.bottom = size.h;
    camera.updateProjectionMatrix();

    // Tear down previous data group.
    if (dataGroupRef.current) {
      scene.remove(dataGroupRef.current);
      disposeObject3D(dataGroupRef.current);
      dataGroupRef.current = null;
    }

    if (stacked.visibleModels.length === 0) {
      renderer.render(scene, camera);
      return;
    }

    const group = new THREE.Group();

    // Grid first so bands draw on top.
    group.add(buildGrid(scales, yTicks, themeColors.grid));

    // Bands — bottom-first. Color index comes from the stable allModels
    // list so a model's color doesn't shift when other models toggle
    // on/off.
    for (let i = 0; i < stacked.visibleModels.length; i++) {
      const model = stacked.visibleModels[i];
      const allIdx = allModels.indexOf(model);
      const color = themeColors.bandColors[allIdx];
      group.add(buildBand(scales, stacked, i, color));
      group.add(buildOutline(scales, stacked, i, color));
    }

    scene.add(group);
    dataGroupRef.current = group;
    renderer.render(scene, camera);
  }, [size, stacked, scales, yTicks, themeColors, allModels]);

  // Pointer → bucket index. Handled on the wrapper div so the whole
  // plot area (not just the canvas, which may have different hit
  // testing semantics) participates.
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < scales.plotLeft || x > scales.plotRight || y < scales.plotTop || y > scales.plotBottom) {
      setHover(null);
      return;
    }
    const N = stacked.buckets.length;
    if (N === 0) return;
    const rel = (x - scales.plotLeft) / scales.plotWidth;
    const bucketIdx = Math.max(0, Math.min(N - 1, Math.round(rel * (N - 1))));
    setHover({ bucketIdx, pointerClientX: e.clientX, pointerClientY: e.clientY });
  };
  const handlePointerLeave = () => setHover(null);

  // Hover tooltip contents — lazily computed when hover changes.
  const tooltip = useMemo(() => {
    if (!hover) return null;
    const { bucketIdx } = hover;
    const bucket = stacked.buckets[bucketIdx];
    const rows = stacked.visibleModels.map((model) => ({
      model,
      cost: stacked.perModelCost[model]?.[bucketIdx] ?? 0,
      colorIdx: allModels.indexOf(model),
    }));
    const total = rows.reduce((acc, r) => acc + r.cost, 0);
    return { bucket, rows, total };
  }, [hover, stacked, allModels]);

  const yTickLabels = yTicks.map((v) => ({
    value: v,
    top: scales.yForValue(v),
  }));
  const xTickLabels = stacked.buckets
    .map((b, i) => ({ bucket: b, i, left: scales.xForBucket(i) }))
    .filter((t) => t.i % xTickStride === 0);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--panel-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* three.js canvas */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Axis labels overlay. pointerEvents:none so the wrapper's
          move/leave handlers get the hover events. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
          fontSize: 10,
          color: 'var(--ink-3)',
        }}
      >
        {yTickLabels.map((t) => (
          <div
            key={`y-${t.value}`}
            style={{
              position: 'absolute',
              right: `calc(100% - ${scales.plotLeft - 4}px)`,
              top: t.top,
              transform: 'translateY(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {`$${t.value.toFixed(t.value >= 1 ? 2 : 4)}`}
          </div>
        ))}
        {xTickLabels.map((t) => (
          <div
            key={`x-${t.i}`}
            style={{
              position: 'absolute',
              left: t.left,
              top: scales.plotBottom + 6,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatBucketTick(t.bucket)}
          </div>
        ))}
      </div>

      {/* Hover guide line + tooltip. */}
      {hover && tooltip && (() => {
        const guideX = scales.xForBucket(hover.bucketIdx);
        return (
          <>
            <div
              style={{
                position: 'absolute',
                left: guideX,
                top: scales.plotTop,
                width: 1,
                height: scales.plotHeight,
                background: 'var(--ink-2)',
                opacity: 0.35,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: hover.pointerClientX + 14,
                top: hover.pointerClientY + 14,
                padding: '8px 10px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                boxShadow: 'var(--shadow-md)',
                fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
                fontSize: 11,
                color: 'var(--ink)',
                minWidth: 200,
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            >
              <div style={{ color: 'var(--ink-2)', marginBottom: 6 }}>
                {new Date(tooltip.bucket).toLocaleString()}
              </div>
              {/* Stack-order (top-to-bottom visually). We render the
                  rows in reverse so the top of the stacked graph is
                  the first row in the tooltip. */}
              {[...tooltip.rows].reverse().map((row) => (
                <div
                  key={row.model}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.4 }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: colors.chart[row.colorIdx % colors.chart.length],
                    }}
                  />
                  <span style={{ flex: 1 }}>{row.model}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${row.cost.toFixed(4)}
                  </span>
                </div>
              ))}
              <div
                style={{
                  marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line-2)',
                  display: 'flex', justifyContent: 'space-between', gap: 8,
                  color: 'var(--ink-2)',
                }}
              >
                <span>total</span>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  ${tooltip.total.toFixed(4)}
                </span>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// Cost by Model — three.js 3D pie chart showing each model's share of
// LLM cost over the dashboard-level time range. Complements Cost Trend
// (which shows cost over time) by answering "who is spending the
// money right now".
//
// Reads the same `onex.snapshot.projection.llm_cost.v1` topic the
// Cost Trend widgets read, filters client-side by the global time
// range, and aggregates to (model → total cost, percentage).
//
// Scene: one tilted pie, lying on the XZ plane with its extrusion
// going up in +Y. Slices are built via THREE.Shape + ExtrudeGeometry
// so a single mesh holds the whole 3D slice (top face + sides) and
// the picking raycast is straightforward. Hover "pops" the slice
// outward along its mid-angle for a classic pie-chart interaction.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useThemeColors, useThemeName, cssColorToHex } from '@/theme';
import { useFrameStore } from '@/store/store';

interface CostDataPoint {
  bucket_time: string;
  model_name: string;
  total_cost_usd: string;
}

interface ModelSlice {
  model: string;
  cost: number;
  percentage: number; // 0..100
  /** Index into the shared chart palette — kept stable across refetches
   *  so a model's color doesn't shift when costs rebalance. */
  colorIdx: number;
}

function aggregate(data: CostDataPoint[], colorIdxFor: (model: string) => number): {
  slices: ModelSlice[];
  total: number;
} {
  const byModel = new Map<string, number>();
  for (const d of data) {
    const cost = parseFloat(d.total_cost_usd) || 0;
    byModel.set(d.model_name, (byModel.get(d.model_name) ?? 0) + cost);
  }
  let total = 0;
  for (const v of byModel.values()) total += v;
  const slices: ModelSlice[] = [];
  for (const [model, cost] of byModel.entries()) {
    slices.push({
      model,
      cost,
      percentage: total > 0 ? (cost / total) * 100 : 0,
      colorIdx: colorIdxFor(model),
    });
  }
  // Largest share first — both for the legend read and to put the
  // biggest slice at the start of the pie.
  slices.sort((a, b) => b.cost - a.cost);
  return { slices, total };
}

// ---------- Three.js scene ----------

const OUTER_R = 1.0;
const THICKNESS = 0.18;
const POP_OUT = 0.09;
// A tiny bevel hint around the top face — catches directional light
// and keeps slices from reading as flat coloured wedges.
const CURVE_SEGMENTS = 64;

/**
 * 2D wedge shape (center → outer edge → arc → back to center), ready
 * to extrude along the y-axis after the parent group's rotation.
 */
function buildSliceShape(startAngle: number, endAngle: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(OUTER_R * Math.cos(startAngle), OUTER_R * Math.sin(startAngle));
  shape.absarc(0, 0, OUTER_R, startAngle, endAngle, false);
  shape.lineTo(0, 0);
  return shape;
}

interface SliceHandle {
  mesh: THREE.Mesh;
  midAngle: number;
  colorIdx: number;
  sliceIdx: number;
}

// Per-theme visual knobs. Dark theme uses a lit MeshStandardMaterial
// with emissive for the Tron-ish glow; light theme uses unlit
// MeshBasicMaterial so slice colours render at their exact palette
// value (matching how the ECharts-based Delegation Metrics pie looks
// in light mode). With MeshStandardMaterial + ambient/key lighting
// but no emissive, the pastel light palette was getting multiplied
// by a total intensity ≤ 1 and reading as noticeably dulled.
type PieMaterialKind = 'standard' | 'basic';
interface PieTheme {
  materialKind: PieMaterialKind;
  ambient: number;         // only consumed by 'standard'
  keyIntensity: number;    // only consumed by 'standard'
  sliceMetalness: number;  // only consumed by 'standard'
  sliceRoughness: number;  // only consumed by 'standard'
  emissiveIntensity: number; // only consumed by 'standard'
  canvasBgCss: string;
  groundHex: number;
}

const DARK_PIE_THEME: PieTheme = {
  materialKind: 'standard',
  ambient: 0.55,
  keyIntensity: 0.9,
  sliceMetalness: 0.15,
  sliceRoughness: 0.45,
  emissiveIntensity: 0.12,
  canvasBgCss: 'var(--panel-2)',
  groundHex: 0x020812,
};

const LIGHT_PIE_THEME: PieTheme = {
  materialKind: 'basic',
  ambient: 0,      // unused under 'basic'
  keyIntensity: 0, // unused under 'basic'
  sliceMetalness: 0,
  sliceRoughness: 0,
  emissiveIntensity: 0,
  canvasBgCss: 'var(--panel-2)',
  groundHex: 0xf7f8fa,
};

interface HoverInfo {
  sliceIdx: number;
  clientX: number;
  clientY: number;
}

interface ThreePieChartProps {
  slices: ModelSlice[];
  /** Chart palette CSS strings, index-aligned with ModelSlice.colorIdx. */
  chartColors: string[];
  themeName: 'dark' | 'light';
}

const CANVAS_HEIGHT = 260;

function ThreePieChart({ slices, chartColors, themeName }: ThreePieChartProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pieGroupRef = useRef<THREE.Group | null>(null);
  const slicesRef = useRef<SliceHandle[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const pieTheme = themeName === 'dark' ? DARK_PIE_THEME : LIGHT_PIE_THEME;

  // Resolve palette to THREE-friendly hex via the canvas trick — our
  // tokens are oklch() and THREE.Color.setStyle can't parse them.
  const paletteHex = useMemo(
    () => chartColors.map((c) => cssColorToHex(c)),
    [chartColors],
  );

  // Mount renderer / scene / camera once. Lights live on the scene so
  // they survive data refreshes (slice rebuilds tear down only the
  // pie group).
  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'default',
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

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.set(0, 2.2, 2.4);
    camera.lookAt(0, 0.05, 0);
    cameraRef.current = camera;

    // Lighting — both slice materials below are MeshStandardMaterial
    // so without lights the pie reads as flat wedges.
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    ambient.name = 'ambient';
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.name = 'key';
    key.position.set(3, 5, 2);
    scene.add(key);

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(2, Math.floor(e.contentRect.width));
        const h = Math.max(2, Math.floor(e.contentRect.height));
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    });
    ro.observe(mount);

    return () => {
      ro.disconnect();
      if (pieGroupRef.current) {
        scene.remove(pieGroupRef.current);
        pieGroupRef.current.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry?.dispose();
            const mat = o.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose();
          }
        });
        pieGroupRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Rebuild the pie when slices / size / theme change. Re-rendered
  // once after rebuild; no rAF loop.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (size.w < 2 || size.h < 2) return;

    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();

    // Sync light intensities to the current theme.
    const ambient = scene.getObjectByName('ambient') as THREE.AmbientLight | undefined;
    const key = scene.getObjectByName('key') as THREE.DirectionalLight | undefined;
    if (ambient) ambient.intensity = pieTheme.ambient;
    if (key) key.intensity = pieTheme.keyIntensity;

    // Tear down previous pie.
    if (pieGroupRef.current) {
      scene.remove(pieGroupRef.current);
      pieGroupRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      pieGroupRef.current = null;
      slicesRef.current = [];
    }

    if (slices.length === 0) {
      renderer.render(scene, camera);
      return;
    }

    // Single-slice edge case: a single wedge spanning 0..2π produces a
    // malformed shape. Give it an almost-full circle (with a hair-line
    // seam) so the geometry and raycast behave predictably.
    const pieGroup = new THREE.Group();
    pieGroup.rotation.x = -Math.PI / 2; // lay flat on XZ
    const handles: SliceHandle[] = [];
    let angle = Math.PI / 2; // start at 12 o'clock for familiar layout
    const totalPct = slices.reduce((a, s) => a + s.percentage, 0) || 100;
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      let sweep = (s.percentage / totalPct) * Math.PI * 2;
      // Go clockwise (negative sweep in standard math angles) so
      // "largest first, largest slice starts at the top and rotates
      // clockwise" matches reader expectations.
      if (slices.length === 1) sweep = Math.PI * 2 - 0.001;
      const startAngle = angle - sweep;
      const endAngle = angle;
      const shape = buildSliceShape(startAngle, endAngle);
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: THICKNESS,
        bevelEnabled: false,
        curveSegments: CURVE_SEGMENTS,
      });
      const colorHex = paletteHex[s.colorIdx % paletteHex.length];
      const mat = pieTheme.materialKind === 'basic'
        ? new THREE.MeshBasicMaterial({ color: colorHex })
        : new THREE.MeshStandardMaterial({
            color: colorHex,
            metalness: pieTheme.sliceMetalness,
            roughness: pieTheme.sliceRoughness,
            emissive: colorHex,
            emissiveIntensity: pieTheme.emissiveIntensity,
          });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData.sliceIdx = i;
      pieGroup.add(mesh);
      handles.push({
        mesh,
        midAngle: (startAngle + endAngle) / 2,
        colorIdx: s.colorIdx,
        sliceIdx: i,
      });
      angle -= sweep;
    }

    // Ground disk under the pie so the shadow of thickness reads
    // against a solid plane (matches the floor convention of the
    // other three.js widgets).
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(OUTER_R * 1.3, 48),
      new THREE.MeshBasicMaterial({ color: pieTheme.groundHex }),
    );
    ground.position.y = -0.001;
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // Stash for cleanup so the next rebuild doesn't leak it. We put
    // it on the pieGroup's userData to find it on teardown.
    pieGroup.userData.ground = ground;

    scene.add(pieGroup);
    pieGroupRef.current = pieGroup;
    slicesRef.current = handles;

    renderer.render(scene, camera);

    // Cleanup that extra ground at scene teardown.
    return () => {
      scene.remove(ground);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    };
  }, [slices, size, pieTheme, paletteHex]);

  // Apply hover pop-out. Separate effect so we don't rebuild the
  // whole pie on every pointer move.
  useEffect(() => {
    const pieGroup = pieGroupRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!pieGroup || !renderer || !scene || !camera) return;
    for (const h of slicesRef.current) {
      if (hover && hover.sliceIdx === h.sliceIdx) {
        // Pre-rotation local coords: pop in +x/+y direction of the
        // shape plane. The parent rotation (x = -π/2) maps these onto
        // the XZ plane in world space.
        h.mesh.position.set(
          Math.cos(h.midAngle) * POP_OUT,
          Math.sin(h.midAngle) * POP_OUT,
          0,
        );
      } else {
        h.mesh.position.set(0, 0, 0);
      }
    }
    renderer.render(scene, camera);
  }, [hover]);

  // Pointer hover → raycast → find hovered slice.
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    if (!mount || !camera || slicesRef.current.length === 0) return;
    const rect = mount.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const meshes = slicesRef.current.map((h) => h.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      setHover(null);
      return;
    }
    const idx = hits[0].object.userData.sliceIdx;
    if (typeof idx !== 'number') {
      setHover(null);
      return;
    }
    setHover({ sliceIdx: idx, clientX: e.clientX, clientY: e.clientY });
  }, []);
  const handlePointerLeave = () => setHover(null);

  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    return slices[hover.sliceIdx] ?? null;
  }, [hover, slices]);

  return (
    <div
      ref={mountRef}
      data-drag-exclude="true"
      style={{
        position: 'relative',
        width: '100%',
        height: CANVAS_HEIGHT,
        background: pieTheme.canvasBgCss,
        border: '1px solid var(--line-2)',
        borderRadius: 6,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {hover && hoverInfo && (
        <div
          style={{
            position: 'fixed',
            left: hover.clientX + 14,
            top: hover.clientY + 14,
            padding: '6px 10px',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--ink)',
            minWidth: 160,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div style={{ color: 'var(--ink-2)', marginBottom: 2, fontWeight: 600 }}>
            {hoverInfo.model}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--ink-2)' }}>cost</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${hoverInfo.cost.toFixed(4)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--ink-2)' }}>share</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {hoverInfo.percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Outer component ----------

export default function CostByModelPie({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: 'onex.snapshot.projection.llm_cost.v1',
    queryKey: ['cost-by-model'],
    refetchInterval: 60_000,
  });

  // Dashboard-level time range (supports_time_range: true).
  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const filteredData = useMemo(
    () => applyTimeRange(data, (d) => d.bucket_time, resolved),
    [data, resolved],
  );

  const colors = useThemeColors();
  const themeName = useThemeName();

  // Stable model-to-palette-index mapping. Computed off the full
  // (un-range-filtered) dataset so a model keeps its color even if
  // it's filtered out by the current range and later re-enters.
  const colorIdxFor = useMemo(() => {
    const order = [...new Set((data ?? []).map((d) => d.model_name))].sort();
    const map = new Map<string, number>();
    order.forEach((m, i) => map.set(m, i));
    return (model: string) => map.get(model) ?? 0;
  }, [data]);

  const { slices, total } = useMemo(
    () => aggregate(filteredData, colorIdxFor),
    [filteredData, colorIdxFor],
  );

  const hasAnyData = Boolean(data && data.length > 0);
  const rangeActive = Boolean(resolved);
  const inRangeEmpty = hasAnyData && slices.length === 0;

  return (
    <ComponentWrapper
      title="Cost by Model"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!hasAnyData}
      emptyMessage="No cost data available"
      emptyHint="Cost data appears after LLM calls are tracked"
    >
      {hasAnyData && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'stretch',
            width: '100%',
          }}
        >
          {/* Pie area. Shows the in-range-empty message as an overlay
              so the frame stays put. */}
          <div style={{ flex: '1 1 auto', minWidth: 0, position: 'relative' }}>
            <ThreePieChart
              slices={slices}
              chartColors={colors.chart}
              themeName={themeName}
            />
            {inRangeEmpty && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-3)',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              >
                {rangeActive
                  ? 'No cost data in the selected time range'
                  : 'No cost data'}
              </div>
            )}
          </div>

          {/* Legend — one row per model, sorted by share descending. */}
          <div
            style={{
              flex: '0 0 180px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '4px 2px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink)',
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 4,
              }}
            >
              Models
            </div>
            {slices.map((s) => {
              const color = colors.chart[s.colorIdx % colors.chart.length];
              return (
                <div
                  key={s.model}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 0',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: color,
                      border: `1px solid ${color}`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={s.model}
                  >
                    {s.model}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--ink-2)',
                      fontSize: 10,
                    }}
                  >
                    {s.percentage.toFixed(1)}%
                  </span>
                </div>
              );
            })}
            {total > 0 && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 6,
                  borderTop: '1px solid var(--line-2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--ink-2)',
                }}
              >
                <span>total</span>
                <span
                  style={{
                    color: 'var(--ink)',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ${total.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}

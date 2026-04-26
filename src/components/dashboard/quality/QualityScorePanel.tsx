// Quality Scores — three.js 2D/3D hybrid. Reads a summary record with a
// 5-bucket histogram and renders:
//
//   Left pane:  large pass-rate headline + supporting stats (mean,
//               measurement count). Read first on a glance.
//   Right pane: a tilted 3D bar chart. Bars coloured by quality tier
//               (red→amber→green gradient), a translucent vertical
//               plane marking the pass threshold (so "right of the
//               wall = passing" reads spatially), and a small floating
//               marker pointing at the mean score's x-position.
//
// The rewrite replaces an ECharts bar chart with a wrong-color-per-
// bucket palette and a mean-line that averaged bucket counts rather
// than the weighted score mean. The new version makes the pass-rate
// the primary number (actionable on a dashboard) and uses colour +
// spatial cues so the distribution's quality story reads instantly.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { cssVarToHex, useThemeName } from '@/theme';
import { Text, Heading } from '@/components/ui/typography';

export interface QualityDistributionBucket {
  bucket: string;
  count: number;
}

export interface QualitySummary {
  meanScore: number;
  distribution: QualityDistributionBucket[];
  totalMeasurements: number;
}

interface QualityScoreConfig {
  /** Score at/above which a measurement is considered passing. Default 0.8. */
  passThreshold?: number;
}

// Layout in world units. 5 bars, evenly spaced, centered around x=0.
// scoreToX maps a score in [0, 1] onto the bar-strip x range.
const BAR_COUNT = 5;

// Score-domain midpoints derived from BAR_COUNT so the two stay in sync.
// For BAR_COUNT = 5 this is [0.1, 0.3, 0.5, 0.7, 0.9] — same values the
// fixture generator's bucket labels imply ("0.0-0.2" → midpoint 0.1, etc.).
// Deriving keeps the constants honest if BAR_COUNT ever changes.
const BUCKET_MIDPOINTS: readonly number[] = Array.from(
  { length: BAR_COUNT },
  (_, i) => (i + 0.5) / BAR_COUNT,
);
const BAR_SPACING = 1.1;
const BAR_WIDTH = 0.7;
const BAR_DEPTH = 0.7;
const MAX_BAR_HEIGHT = 2.5;
const STRIP_HALF_WIDTH = (BAR_COUNT - 1) * BAR_SPACING / 2;

function xForBucketIndex(i: number): number {
  return i * BAR_SPACING - STRIP_HALF_WIDTH;
}

function scoreToX(score: number): number {
  // Score 0.1 → leftmost bar center, score 0.9 → rightmost bar center.
  // Linearly extrapolate outside that range.
  return (score - 0.1) / (0.9 - 0.1) * ((BAR_COUNT - 1) * BAR_SPACING) - STRIP_HALF_WIDTH;
}

// Quality tier color: red (0) → amber (middle) → green (1). Saturation
// + lightness come from the theme-specific `effective` block below so
// the palette tones down for the light theme (garish neon on white
// reads badly, and we want to match the pastel aesthetic that
// cost-trend-3d established for light mode).
function tierHexForIndex(i: number, sat: number, light: number): number {
  const t = BAR_COUNT > 1 ? i / (BAR_COUNT - 1) : 0;
  const hue = t * 120; // 0=red, 60=yellow, 120=green
  return new THREE.Color().setHSL(hue / 360, sat, light).getHex();
}

// Per-theme visual knobs. Dark theme leans into the Tron look
// (saturated bars, cyan grid, bright outlines). Light theme tones
// everything down and replaces white-on-white combinations (which
// were invisible) with neutral greys and slate.
interface EffectiveColors {
  gridColor: number;
  gridOpacity: number;
  thresholdPlaneColor: number;
  thresholdPlaneOpacity: number;
  thresholdOutlineColor: number;
  thresholdOutlineOpacity: number;
  barCoreOpacity: number;
  barEdgeOpacity: number;
  barSaturation: number;
  barLightness: number;
  /** CSS var string for the mount div background. */
  canvasBg: string;
  /**
   * Explicit sRGB hex for the ground plane. We use a concrete number
   * rather than a CSS variable lookup here because Canvas 2D's
   * fillStyle setter (which cssColorToHex uses under the hood)
   * rejects `var()` syntax and previously fell through to a near-
   * black fallback — which looked correct on the dark theme but
   * produced a black floor in light mode. Values mirror the
   * DARK_THEME / LIGHT_THEME floors cost-trend-3d ships with so the
   * two three.js widgets stay visually consistent.
   */
  groundHex: number;
}

const DARK_EFFECTIVE: EffectiveColors = {
  gridColor: 0x00e5ff,          // cyan, Tron signature
  gridOpacity: 0.35,
  thresholdPlaneColor: 0xffffff,
  thresholdPlaneOpacity: 0.08,
  thresholdOutlineColor: 0xffffff,
  thresholdOutlineOpacity: 0.75,
  barCoreOpacity: 0.55,
  barEdgeOpacity: 0.95,
  barSaturation: 0.85,
  barLightness: 0.62,
  canvasBg: 'var(--panel-2)',
  groundHex: 0x020812,          // matches cost-trend-3d DARK_THEME.floor
};

const LIGHT_EFFECTIVE: EffectiveColors = {
  gridColor: 0x6b7280,          // medium slate, visible on near-white
  gridOpacity: 0.45,
  thresholdPlaneColor: 0x334155, // dark slate — white-on-white was invisible
  thresholdPlaneOpacity: 0.1,
  thresholdOutlineColor: 0x334155,
  thresholdOutlineOpacity: 0.7,
  barCoreOpacity: 0.72,         // more opaque so bars read against white bg
  barEdgeOpacity: 0.8,          // slightly less than dark — neon edges feel
  barSaturation: 0.6,           //   garish on white; soften the palette to
  barLightness: 0.5,            //   match the pastel aesthetic used elsewhere
  canvasBg: 'var(--panel-2)',
  groundHex: 0xf7f8fa,          // matches cost-trend-3d LIGHT_THEME.floor
};

// ---------- 3D chart ----------

interface HoverInfo {
  bucketIdx: number;
  clientX: number;
  clientY: number;
}

interface ThreeBarChartProps {
  distribution: QualityDistributionBucket[];
  meanScore: number;
  passThreshold: number;
  maxCount: number;
  totalMeasurements: number;
}

const CANVAS_HEIGHT = 240;

function ThreeBarChart({
  distribution, meanScore, passThreshold, maxCount, totalMeasurements,
}: ThreeBarChartProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const barsRef = useRef<THREE.Mesh[]>([]);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Mean marker's projected canvas-pixel position. Recomputed during
  // every scene rebuild so the HTML "MEAN 0.XX" label tracks the cone.
  const [meanLabelPos, setMeanLabelPos] = useState<{ x: number; y: number } | null>(null);

  const themeName = useThemeName();
  const effective = themeName === 'dark' ? DARK_EFFECTIVE : LIGHT_EFFECTIVE;

  // Mount once.
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

    // PerspectiveCamera positioned for a slightly-elevated, slightly-
    // tilted three-quarter view. No orbit controls — the snapshot
    // benefits from a consistent framing rather than user rotation.
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 3.2, 6.2);
    camera.lookAt(0, 0.9, 0);
    cameraRef.current = camera;

    // No lights — all materials below are MeshBasicMaterial (unlit),
    // matching the cost-trend-3d Tron aesthetic where edges + self-
    // colored fills carry the 3D read without shading.

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
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Rebuild the data-dependent scene content (bars, threshold plane,
  // mean marker, ground, gridlines) whenever inputs change.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (size.w < 2 || size.h < 2) return;

    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();

    // Tear down previous scene content. Keep lights + any persistent
    // objects by tagging only the dynamic group.
    const existing = scene.getObjectByName('dynamic');
    if (existing) {
      existing.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        } else if (o instanceof THREE.Line || o instanceof THREE.LineSegments) {
          o.geometry?.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      scene.remove(existing);
    }

    const group = new THREE.Group();
    group.name = 'dynamic';

    // Subtle ground plane sized to the bar strip. Uses `var(--panel)`
    // so it sits a step away from the canvas background (`--panel-2`)
    // in both themes — gives the floor a visible boundary without
    // needing a shadow or gradient.
    const groundW = STRIP_HALF_WIDTH * 2 + BAR_WIDTH + 1.2;
    const groundD = BAR_DEPTH * 2.2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundW, groundD),
      new THREE.MeshBasicMaterial({ color: effective.groundHex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    group.add(ground);

    // Tick gridlines on the ground at each bucket x-boundary.
    const tickPositions: number[] = [];
    for (let i = 0; i <= BAR_COUNT; i++) {
      tickPositions.push(-STRIP_HALF_WIDTH - BAR_SPACING / 2 + i * BAR_SPACING);
    }
    const gridGeom = new THREE.BufferGeometry();
    const gridVerts: number[] = [];
    for (const x of tickPositions) {
      gridVerts.push(x, 0, -BAR_DEPTH, x, 0, BAR_DEPTH);
    }
    gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
    group.add(new THREE.LineSegments(
      gridGeom,
      new THREE.LineBasicMaterial({
        color: effective.gridColor,
        transparent: true,
        opacity: effective.gridOpacity,
      }),
    ));

    // Bars — translucent coloured core + bright edges. The
    // EdgesGeometry outline on all 12 cube edges carries the 3D read
    // without lighting. Per-theme saturation / lightness / opacity
    // means dark theme keeps the Tron look while light theme softens
    // to pastel-on-white for legibility.
    const bars: THREE.Mesh[] = [];
    distribution.forEach((b, i) => {
      const heightFactor = maxCount > 0 ? b.count / maxCount : 0;
      const h = Math.max(0.02, heightFactor * MAX_BAR_HEIGHT);
      const color = tierHexForIndex(i, effective.barSaturation, effective.barLightness);

      const boxGeom = new THREE.BoxGeometry(BAR_WIDTH, h, BAR_DEPTH);
      const core = new THREE.Mesh(
        boxGeom,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: effective.barCoreOpacity,
          depthWrite: false,
        }),
      );
      core.position.set(xForBucketIndex(i), h / 2, 0);
      core.userData.bucketIdx = i;
      group.add(core);
      bars.push(core);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeom),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: effective.barEdgeOpacity,
        }),
      );
      edges.position.copy(core.position);
      group.add(edges);
    });
    barsRef.current = bars;

    // Pass-threshold plane. Vertical quad at the x-position matching
    // `passThreshold`. Everything to its right is "passing"; the
    // plane reads as a dividing wall.
    const thresholdX = scoreToX(passThreshold);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_DEPTH * 2, MAX_BAR_HEIGHT + 0.6),
      new THREE.MeshBasicMaterial({
        color: effective.thresholdPlaneColor,
        transparent: true,
        opacity: effective.thresholdPlaneOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.position.set(thresholdX, (MAX_BAR_HEIGHT + 0.6) / 2, 0);
    plane.rotation.y = Math.PI / 2;
    group.add(plane);
    // Rectangle outline on the threshold plane so it reads as a crisp
    // divider rather than a faint tint.
    const thresholdLineGeom = new THREE.BufferGeometry();
    const thP = [
      thresholdX, 0, -BAR_DEPTH,
      thresholdX, MAX_BAR_HEIGHT + 0.3, -BAR_DEPTH,
      thresholdX, MAX_BAR_HEIGHT + 0.3, BAR_DEPTH,
      thresholdX, 0, BAR_DEPTH,
    ];
    thresholdLineGeom.setAttribute('position', new THREE.Float32BufferAttribute(thP, 3));
    group.add(new THREE.LineSegments(
      thresholdLineGeom,
      new THREE.LineBasicMaterial({
        color: effective.thresholdOutlineColor,
        transparent: true,
        opacity: effective.thresholdOutlineOpacity,
      }),
    ));

    // Mean marker. Inverted cone hovering above the bars pointing
    // down at the mean score's x-position. Unlit material (matches
    // the rest of the scene); emissive is redundant here since there
    // are no lights. The previous dashed drop line was removed — it
    // kept getting hidden behind the tallest bar, and an HTML label
    // tied to the cone's projected position communicates the cone's
    // meaning more directly.
    const meanX = scoreToX(meanScore);
    const markerColor = cssVarToHex('--brand', 0x00e5ff);
    const markerGeom = new THREE.ConeGeometry(0.2, 0.42, 16);
    markerGeom.rotateX(Math.PI);
    const marker = new THREE.Mesh(
      markerGeom,
      new THREE.MeshBasicMaterial({ color: markerColor }),
    );
    const markerY = MAX_BAR_HEIGHT + 0.55;
    marker.position.set(meanX, markerY, 0);
    group.add(marker);

    scene.add(group);

    // Project the marker's world position to canvas pixels so the
    // HTML "MEAN X.XX" label can be anchored just above the cone.
    // Camera matrices are current because we just called
    // updateProjectionMatrix above.
    const projected = new THREE.Vector3(meanX, markerY, 0).project(camera);
    const screenX = (projected.x * 0.5 + 0.5) * size.w;
    const screenY = (-projected.y * 0.5 + 0.5) * size.h;
    setMeanLabelPos({ x: screenX, y: screenY });

    renderer.render(scene, camera);
  }, [distribution, meanScore, passThreshold, maxCount, size, effective]);

  // Hover raycast. On pointer move inside the canvas, find the bar
  // under the pointer (if any) and surface it for the tooltip.
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    if (!mount || !camera || barsRef.current.length === 0) return;
    const rect = mount.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(barsRef.current, false);
    if (hits.length === 0) {
      setHover(null);
      return;
    }
    const idx = hits[0].object.userData.bucketIdx;
    if (typeof idx !== 'number') {
      setHover(null);
      return;
    }
    setHover({ bucketIdx: idx, clientX: e.clientX, clientY: e.clientY });
  }, []);
  const handlePointerLeave = () => setHover(null);

  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    const b = distribution[hover.bucketIdx];
    if (!b) return null;
    const pct = totalMeasurements > 0 ? (b.count / totalMeasurements) * 100 : 0;
    return { bucket: b, pct };
  }, [hover, distribution, totalMeasurements]);

  return (
    <div
      ref={mountRef}
      data-drag-exclude="true"
      style={{
        position: 'relative',
        width: '100%',
        height: CANVAS_HEIGHT,
        background: effective.canvasBg,
        border: '1px solid var(--line-2)',
        borderRadius: 6,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Threshold label — small annotation anchored to top-right of
          the canvas so the user knows what the translucent wall means
          without hovering anything. */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          pointerEvents: 'none',
        }}
      >
        <Text
          size="xs"
          color="tertiary"
          family="mono"
          transform="uppercase"
        >
          Pass ≥ {passThreshold.toFixed(2)}
        </Text>
      </div>

      {/* Mean label anchored to the cone marker's projected canvas
          position. Positioned just above the cone so the relationship
          ("this shape marks the mean") reads without a drop line. */}
      {meanLabelPos && (
        <div
          style={{
            position: 'absolute',
            left: meanLabelPos.x,
            top: meanLabelPos.y - 6,
            transform: 'translate(-50%, -100%)',
            padding: '2px 6px',
            background: 'var(--panel)',
            border: '1px solid var(--brand)',
            borderRadius: 3,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <Text
            size="xs"
            family="mono"
            transform="uppercase"
            style={{ color: 'var(--brand-ink, var(--ink))' }}
          >
            Mean {meanScore.toFixed(2)}
          </Text>
        </div>
      )}

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
            minWidth: 140,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <Text as="div" size="sm" family="mono" color="secondary" style={{ marginBottom: 2 }}>
            Score {hoverInfo.bucket.bucket}
          </Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text size="sm" family="mono" color="secondary">count</Text>
            <Text size="sm" family="mono" weight="semibold" tabularNums>
              {hoverInfo.bucket.count.toLocaleString()}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text size="sm" family="mono" color="secondary">share</Text>
            <Text size="sm" family="mono" tabularNums>
              {hoverInfo.pct.toFixed(1)}%
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Outer component ----------

export default function QualityScorePanel({ config }: { config: QualityScoreConfig }) {
  const passThreshold = config.passThreshold ?? 0.8;
  const { data: dataArr, isLoading, error } = useProjectionQuery<QualitySummary>({
    topic: TOPICS.baselinesQuality,
    queryKey: ['quality-summary'],
    refetchInterval: 60_000,
  });
  const data = dataArr?.[0];

  const stats = useMemo(() => {
    if (!data) return null;
    const { distribution, meanScore, totalMeasurements } = data;
    // Pass count: sum of buckets whose midpoint is at/above the pass
    // threshold. The exact semantics are "a score of X counts as a
    // pass when X ≥ threshold" — since buckets carry ranges we
    // approximate with the midpoint, which matches the mean-score
    // computation convention the fixture generator uses.
    let passingCount = 0;
    // Only count buckets whose index has a known midpoint. If the backend
    // ever returns more buckets than the widget expects, the surplus is
    // ignored (rather than silently undercounted by `undefined >= n` being
    // false). A length mismatch is a real signal — log it once so the
    // operator notices instead of seeing a quietly-wrong pass rate.
    if (distribution.length !== BUCKET_MIDPOINTS.length) {
      console.warn(
        `[QualityScorePanel] distribution length ${distribution.length} differs from expected ${BUCKET_MIDPOINTS.length}; pass-rate truncated to known buckets`,
      );
    }
    distribution.forEach((b, i) => {
      const midpoint = BUCKET_MIDPOINTS[i];
      if (midpoint !== undefined && midpoint >= passThreshold) passingCount += b.count;
    });
    const passRate = totalMeasurements > 0 ? passingCount / totalMeasurements : 0;
    const maxCount = distribution.reduce((m, b) => Math.max(m, b.count), 0);
    return { passRate, passingCount, meanScore, totalMeasurements, maxCount };
  }, [data, passThreshold]);

  const isEmpty = !data || data.totalMeasurements === 0;

  return (
    <ComponentWrapper
      title="Quality Scores"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No quality data"
      emptyHint="Quality scores appear after pattern evaluations are recorded"
    >
      {data && !isEmpty && stats && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'stretch',
            width: '100%',
          }}
        >
          {/* Stats pane. Pass rate as the headline — it's the
              actionable signal; mean and count are supporting. */}
          <div
            style={{
              flex: '0 0 130px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '6px 2px',
            }}
          >
            <Heading
              level={1}
              color={
                stats.passRate >= 0.8 ? 'ok'
                  : stats.passRate >= 0.6 ? 'warn'
                  : 'bad'
              }
            >
              <Text as="span" color="inherit" weight="semibold" tabularNums>
                {Math.round(stats.passRate * 100)}%
              </Text>
            </Heading>
            <Text
              as="div"
              size="xs"
              color="tertiary"
              family="mono"
              transform="uppercase"
              style={{ marginTop: 2 }}
            >
              Pass Rate
            </Text>

            <div
              style={{
                height: 1,
                background: 'var(--line-2)',
                margin: '12px 0',
              }}
            />

            <Text
              as="div"
              size="lg"
              color="secondary"
              family="mono"
              style={{ marginBottom: 4 }}
            >
              Mean{' '}
              <Text
                as="strong"
                size="lg"
                color="primary"
                family="mono"
                weight="semibold"
                tabularNums
              >
                {stats.meanScore.toFixed(2)}
              </Text>
            </Text>
            <Text as="div" size="sm" color="tertiary" family="mono">
              {stats.totalMeasurements.toLocaleString()} measurements
            </Text>
          </div>

          {/* Chart pane. */}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <ThreeBarChart
              distribution={data.distribution}
              meanScore={data.meanScore}
              passThreshold={passThreshold}
              maxCount={stats.maxCount}
              totalMeasurements={data.totalMeasurements}
            />
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}

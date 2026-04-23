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
import { cssColorToHex } from '@/theme';

interface QualityDistributionBucket {
  bucket: string;
  count: number;
}

interface QualitySummary {
  meanScore: number;
  distribution: QualityDistributionBucket[];
  totalMeasurements: number;
}

interface QualityScoreConfig {
  /** Score at/above which a measurement is considered passing. Default 0.8. */
  passThreshold?: number;
}

// Score-domain midpoints for the five buckets. The fixture generator
// emits buckets labeled "0.0-0.2" etc.; the midpoints are hardcoded
// here because the bucket labels carry ranges, not numeric centers.
const BUCKET_MIDPOINTS = [0.1, 0.3, 0.5, 0.7, 0.9];

// Layout in world units. 5 bars, evenly spaced, centered around x=0.
// scoreToX maps a score in [0, 1] onto the bar-strip x range.
const BAR_COUNT = 5;
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

// Quality tier color: red (0) → amber (middle) → green (1).
// Returned as a hex number suitable for THREE.Color construction.
function tierHexForIndex(i: number): number {
  const t = BAR_COUNT > 1 ? i / (BAR_COUNT - 1) : 0;
  const hue = t * 120; // 0=red, 120=green
  return new THREE.Color().setHSL(hue / 360, 0.6, 0.55).getHex();
}

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

    // Ground + key light. Cheap flat lighting — MeshStandardMaterial
    // so bars catch the directional light and read as three-
    // dimensional.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 6, 5);
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

    // Subtle ground plane sized to the bar strip.
    const groundW = STRIP_HALF_WIDTH * 2 + BAR_WIDTH + 1.2;
    const groundD = BAR_DEPTH * 2.2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundW, groundD),
      new THREE.MeshStandardMaterial({
        color: cssColorToHex('var(--panel-2)', 0x151922),
        roughness: 1,
      }),
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
        color: cssColorToHex('var(--line)', 0x2c3540),
        transparent: true,
        opacity: 0.5,
      }),
    ));

    // Bars.
    const bars: THREE.Mesh[] = [];
    distribution.forEach((b, i) => {
      const heightFactor = maxCount > 0 ? b.count / maxCount : 0;
      const h = Math.max(0.02, heightFactor * MAX_BAR_HEIGHT);
      const geom = new THREE.BoxGeometry(BAR_WIDTH, h, BAR_DEPTH);
      const color = tierHexForIndex(i);
      const mat = new THREE.MeshStandardMaterial({
        color, metalness: 0.1, roughness: 0.55,
        emissive: color, emissiveIntensity: 0.12,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(xForBucketIndex(i), h / 2, 0);
      mesh.userData.bucketIdx = i;
      group.add(mesh);
      bars.push(mesh);
    });
    barsRef.current = bars;

    // Pass-threshold plane. Vertical quad sitting at the x-position
    // corresponding to `passThreshold`. Everything on its right side
    // is "passing"; the plane itself reads as a dividing wall.
    const thresholdX = scoreToX(passThreshold);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_DEPTH * 2, MAX_BAR_HEIGHT + 0.6),
      planeMat,
    );
    plane.position.set(thresholdX, (MAX_BAR_HEIGHT + 0.6) / 2, 0);
    plane.rotation.y = Math.PI / 2; // face along x
    group.add(plane);
    // Bright outline on the threshold plane so it reads as a line.
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
        color: cssColorToHex('var(--ink)', 0xffffff),
        transparent: true,
        opacity: 0.5,
      }),
    ));

    // Mean marker. Small inverted cone hovering just above the bar
    // tops pointing down at the mean score's x-position. Uses the
    // brand token so it reads as "the headline stat" visually.
    const meanX = scoreToX(meanScore);
    const markerColor = cssColorToHex('var(--brand)', 0x4cc38a);
    const markerGeom = new THREE.ConeGeometry(0.16, 0.3, 12);
    markerGeom.rotateX(Math.PI); // point down
    const marker = new THREE.Mesh(
      markerGeom,
      new THREE.MeshStandardMaterial({
        color: markerColor,
        emissive: markerColor,
        emissiveIntensity: 0.5,
        metalness: 0.2,
        roughness: 0.4,
      }),
    );
    marker.position.set(meanX, MAX_BAR_HEIGHT + 0.5, 0);
    group.add(marker);
    // Dashed drop line from the marker down to the ground.
    const dropGeom = new THREE.BufferGeometry();
    dropGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [meanX, MAX_BAR_HEIGHT + 0.35, 0, meanX, 0, 0], 3,
      ),
    );
    const dropMat = new THREE.LineDashedMaterial({
      color: markerColor,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.6,
    });
    const drop = new THREE.Line(dropGeom, dropMat);
    drop.computeLineDistances();
    group.add(drop);

    scene.add(group);
    renderer.render(scene, camera);
  }, [distribution, meanScore, passThreshold, maxCount, size]);

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
        background: 'var(--panel-2)',
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
          fontSize: 10,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
          pointerEvents: 'none',
        }}
      >
        Pass ≥ {passThreshold.toFixed(2)}
      </div>

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
            fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
            fontSize: 11,
            color: 'var(--ink)',
            minWidth: 140,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div style={{ color: 'var(--ink-2)', marginBottom: 2 }}>
            Score {hoverInfo.bucket.bucket}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--ink-2)' }}>count</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              {hoverInfo.bucket.count.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--ink-2)' }}>share</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {hoverInfo.pct.toFixed(1)}%
            </span>
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
    topic: 'onex.snapshot.projection.baselines.quality.v1',
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
    distribution.forEach((b, i) => {
      if (BUCKET_MIDPOINTS[i] >= passThreshold) passingCount += b.count;
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
              fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
            }}
          >
            <div
              style={{
                fontSize: 42,
                fontWeight: 600,
                lineHeight: 1,
                color: stats.passRate >= 0.8 ? 'var(--status-ok)'
                  : stats.passRate >= 0.6 ? 'var(--status-warn)'
                  : 'var(--status-bad)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(stats.passRate * 100)}%
            </div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              Pass Rate
            </div>

            <div
              style={{
                height: 1,
                background: 'var(--line-2)',
                margin: '12px 0',
              }}
            />

            <div
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                marginBottom: 4,
              }}
            >
              Mean <strong style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {stats.meanScore.toFixed(2)}
              </strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {stats.totalMeasurements.toLocaleString()} measurements
            </div>
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

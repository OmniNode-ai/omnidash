// Experimental 3D Cost Trend widget — "Tron" visualization.
// Raw three.js. Data is plotted as translucent glowing columns on a grid:
// X = time bucket, Z = model, Y = cost.
//
// Camera design (intentionally restrictive — more "side-scroller" than
// first-person-shooter):
//   - Starts facing the strip of values head-on (looking down -Z).
//   - No free orbit / yaw. No scroll-wheel zoom. No drag-pan.
//   - Tilt (pitch) is the only free camera control, via mouse-down drag in
//     the Y direction, clamped to a moderate range.
//   - Horizontal navigation along the timeline is via an HTML scrollbar
//     below the canvas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useTimezone } from '@/hooks/useTimezone';
import { useFrameStore } from '@/store/store';
import { useThemeName, useThemeColors } from '@/theme';
import { Text } from '@/components/ui/typography';

/**
 * Zoned date components for the dashboard's active timezone. Used in
 * place of `Date.prototype.getMonth/getDate/getFullYear/getHours/getMinutes`
 * everywhere this widget formats bucket labels — those raw getters
 * read browser-local values and would disagree with the rest of the
 * dashboard once the user picks an explicit zone via TimezoneSelector.
 */
function zonedComponents(d: Date, timeZone: string): {
  year: string; month: string; day: string; hour: string; minute: string;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

interface CostDataPoint {
  bucket_time: string;
  model_name: string;
  total_cost_usd: string;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  request_count?: number;
}

// ---------- Data reshape ----------

interface GridCell {
  modelName: string;
  modelIndex: number;
  bucketTime: string;
  bucketIndex: number;
  cost: number;
  totalTokens: number;
  requestCount: number;
}

interface GridDataset {
  buckets: string[];
  models: string[];
  cells: GridCell[];
  maxCost: number;
}

function reshapeToGrid(data: CostDataPoint[]): GridDataset {
  const bucketSet = new Set<string>();
  const modelSet = new Set<string>();
  const byKey = new Map<string, GridCell>();
  for (const d of data) {
    bucketSet.add(d.bucket_time);
    modelSet.add(d.model_name);
    const key = `${d.bucket_time}|${d.model_name}`;
    const cost = parseFloat(d.total_cost_usd) || 0;
    const tokens = d.total_tokens ?? 0;
    const reqs = d.request_count ?? 1;
    const existing = byKey.get(key);
    if (existing) {
      existing.cost += cost;
      existing.totalTokens += tokens;
      existing.requestCount += reqs;
    } else {
      byKey.set(key, {
        modelName: d.model_name,
        modelIndex: 0,
        bucketTime: d.bucket_time,
        bucketIndex: 0,
        cost,
        totalTokens: tokens,
        requestCount: reqs,
      });
    }
  }
  const buckets = Array.from(bucketSet).sort();
  const models = Array.from(modelSet).sort((a, b) => {
    const aTotal = Array.from(byKey.values()).filter((c) => c.modelName === a).reduce((acc, c) => acc + c.cost, 0);
    const bTotal = Array.from(byKey.values()).filter((c) => c.modelName === b).reduce((acc, c) => acc + c.cost, 0);
    return bTotal - aTotal;
  });
  const bucketIndexOf = new Map(buckets.map((b, i) => [b, i]));
  const modelIndexOf = new Map(models.map((m, i) => [m, i]));
  const cells: GridCell[] = [];
  let maxCost = 0;
  for (const cell of byKey.values()) {
    cell.bucketIndex = bucketIndexOf.get(cell.bucketTime) ?? 0;
    cell.modelIndex = modelIndexOf.get(cell.modelName) ?? 0;
    if (cell.cost > maxCost) maxCost = cell.cost;
    cells.push(cell);
  }
  return { buckets, models, cells, maxCost: Math.max(maxCost, 0.001) };
}

// ---------- Themes ----------

interface ThemeConfig {
  // THREE.js scene colors (hex numbers for THREE.Color).
  sceneBg: number;
  fog: number;
  floor: number;
  grid: number;
  gridOpacity: number;
  isolatedDimColor: number;
  modelPalette: string[]; // hex strings
  barCoreOpacity: number;
  barEdgeOpacity: number;
  barTopOpacity: number;
  dimCoreOpacity: number;
  dimEdgeOpacity: number;
  dimTopOpacity: number;
  // HTML overlay colors (CSS strings).
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

const DARK_THEME: ThemeConfig = {
  sceneBg: 0x02040a,
  fog: 0x02040a,
  floor: 0x020812,
  grid: 0x00e5ff,
  gridOpacity: 0.9,
  isolatedDimColor: 0x6a7280,
  modelPalette: [
    '#00e5ff', '#ff4fb0', '#ffb547', '#7dff5f',
    '#a385ff', '#ff7046', '#5eb0ff',
  ],
  barCoreOpacity: 0.18,
  barEdgeOpacity: 0.95,
  barTopOpacity: 0.8,
  dimCoreOpacity: 0.05,
  dimEdgeOpacity: 0.22,
  dimTopOpacity: 0.08,
  labelPrimary: '#9ad6ff',
  labelSecondary: '#5ea9cf',
  labelShadow: '0 0 4px rgba(0, 229, 255, 0.35)',
  scrollbarAccent: '#00e5ff',
  panelBg: 'rgba(2, 8, 18, 0.6)',
  panelBorder: 'rgba(0, 229, 255, 0.25)',
  panelHeader: '#00e5ff',
  panelText: '#9ad6ff',
  panelSubtle: '#5ea9cf',
  chipBorder: 'rgba(0, 229, 255, 0.2)',
  tooltipBg: 'rgba(2, 8, 18, 0.92)',
  tooltipText: '#cfe8ff',
  tooltipSubtle: '#9ad6ff',
  tooltipValue: '#ffffff',
};

// Light theme: greys for lines, washed-out pastels for blocks. Intentionally
// quiet — the widget should read like an engineering sketch rather than the
// neon glow of the dark version. Background is pure white so the pastel
// fills read as soft color rather than bleeding into a grey scene.
const LIGHT_THEME: ThemeConfig = {
  sceneBg: 0xffffff,
  fog: 0xffffff,
  floor: 0xf7f8fa,
  grid: 0x6b7280,
  gridOpacity: 0.6,
  isolatedDimColor: 0xa0a5b0,
  modelPalette: [
    '#8fd1d9', // dusty cyan
    '#d9a5c4', // rose pink
    '#e8c899', // soft amber
    '#b5d5ad', // sage
    '#bfb1e0', // muted lavender
    '#e0aa98', // coral dust
    '#a7c2dd', // slate blue
  ],
  // Bar opacities raised significantly vs. the dark theme — pastels on white
  // need solid fills to be visible; if they stay translucent they just look
  // like faint tinted glass that disappears against the background.
  barCoreOpacity: 0.75,
  barEdgeOpacity: 0.9,
  barTopOpacity: 0.9,
  dimCoreOpacity: 0.2,
  dimEdgeOpacity: 0.35,
  dimTopOpacity: 0.25,
  labelPrimary: '#4a5260',
  labelSecondary: '#7c8594',
  labelShadow: 'none',
  scrollbarAccent: '#6b7580',
  panelBg: 'rgba(248, 248, 250, 0.85)',
  panelBorder: 'rgba(120, 128, 140, 0.3)',
  panelHeader: '#5b6572',
  panelText: '#4a5260',
  panelSubtle: '#8089a0',
  chipBorder: 'rgba(120, 128, 140, 0.3)',
  tooltipBg: 'rgba(255, 255, 255, 0.96)',
  tooltipText: '#2a3038',
  tooltipSubtle: '#6b7580',
  tooltipValue: '#000000',
};

function colorForModel(palette: string[], index: number): THREE.Color {
  return new THREE.Color(palette[index % palette.length]);
}
function hexForModel(palette: string[], index: number): string {
  return palette[index % palette.length];
}

// ---------- Layout ----------

const CELL_SIZE = 1.2;
const MAX_BAR_HEIGHT = 4;

function layoutX(bucketIndex: number, bucketCount: number): number {
  const span = bucketCount * CELL_SIZE;
  return bucketIndex * CELL_SIZE - span / 2 + CELL_SIZE / 2;
}
function layoutZ(modelIndex: number, modelCount: number): number {
  const span = modelCount * CELL_SIZE;
  return modelIndex * CELL_SIZE - span / 2 + CELL_SIZE / 2;
}

// ---------- Camera design constants ----------

// Camera orbits a target point on a fixed-radius sphere. Only the pitch
// angle (polar) and the target's X position are free; azimuth is pinned at
// 0 (camera always faces along -Z). Pitch is measured from the world +Y
// axis: π/2 is horizontal, smaller values tilt the camera down toward the
// ground, larger values raise it. We clamp to a medium range that never
// goes fully overhead nor fully underground.
// These values were dialed in via a temporary in-widget tuning panel and
// then frozen once the composition looked right.
const CAMERA_DISTANCE = 11;
const TARGET_Y = 0.6;
const CAMERA_FOV = 30;
const CANVAS_HEIGHT = 200;
const PITCH_DEFAULT = Math.PI / 2 - 0.30; // ~73° from vertical
const PITCH_MIN = Math.PI / 2 - 0.55;     // ~58° — steeper downward tilt
const PITCH_MAX = Math.PI / 2 - 0.05;     // ~87° — nearly eye-level
const PITCH_DRAG_SENSITIVITY = 0.005;     // radians per pixel of mouse Y drag
// Screen-space vertical pan applied via camera.setViewOffset — purely a
// framing tweak, doesn't change camera pose. Positive = up, negative = down.
const Y_OFFSET_PX = -1;

// ---------- Focus animation ----------

// Cinematic swoop constants. Dialed in via a temporary tuning panel and
// then frozen once the feel was right.
const FOCUS_DURATION_MS = 900;
const FOCUS_DISTANCE = 4;          // camera-to-bar distance in world units
const FOCUS_ELEVATION = 1.2;       // camera height above bar mid-height
const FOCUS_LOOKAT_X_OFFSET = 1.5; // shifts lookAt right of bar, pushing bar left in frame
const FOCUS_FOV = 35;
const FOCUS_DIM_OPACITY = 0.04;    // non-focused bars during focus
const FOCUS_BAR_OPACITY = 0.85;    // focused bar during focus
const STATS_SLIDE_MS = 900;        // panel slide-in/out duration (matches camera)

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function cameraPositionFor(targetX: number, pitch: number): THREE.Vector3 {
  // Azimuth pinned at 0 → camera sits on +Z side of target, looking -Z.
  return new THREE.Vector3(
    targetX,
    TARGET_Y + CAMERA_DISTANCE * Math.cos(pitch),
    CAMERA_DISTANCE * Math.sin(pitch),
  );
}

// ---------- Grid (aligned to data cells) ----------

function buildAlignedGrid(
  dataset: GridDataset, theme: ThemeConfig,
): { grid: THREE.LineSegments; material: THREE.LineBasicMaterial } {
  const bucketCount = dataset.buckets.length;
  const modelCount = dataset.models.length;
  const spanX = bucketCount * CELL_SIZE;
  const spanZ = modelCount * CELL_SIZE;
  const positions: number[] = [];
  for (let i = 0; i <= modelCount; i++) {
    const z = i * CELL_SIZE - spanZ / 2;
    positions.push(-spanX / 2, 0, z, spanX / 2, 0, z);
  }
  for (let i = 0; i <= bucketCount; i++) {
    const x = i * CELL_SIZE - spanX / 2;
    positions.push(x, 0, -spanZ / 2, x, 0, spanZ / 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: theme.grid, transparent: true, opacity: theme.gridOpacity,
  });
  return { grid: new THREE.LineSegments(geom, material), material };
}

// ---------- Bars ----------

interface BarHandle {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.LineBasicMaterial;
  topMat: THREE.MeshBasicMaterial;
  modelName: string;
  cell: GridCell;
  originalColor: THREE.Color;
}

function buildBars(
  scene: THREE.Scene, dataset: GridDataset, theme: ThemeConfig,
): { group: THREE.Group; bars: BarHandle[] } {
  const group = new THREE.Group();
  const bars: BarHandle[] = [];
  for (const cell of dataset.cells) {
    const height = Math.max(0.05, (cell.cost / dataset.maxCost) * MAX_BAR_HEIGHT);
    const x = layoutX(cell.bucketIndex, dataset.buckets.length);
    const z = layoutZ(cell.modelIndex, dataset.models.length);
    const color = colorForModel(theme.modelPalette, cell.modelIndex);
    const barGroup = new THREE.Group();
    barGroup.position.set(x, 0, z);
    const coreMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: theme.barCoreOpacity, depthWrite: false,
    });
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE * 0.72, height, CELL_SIZE * 0.72),
      coreMat,
    );
    core.position.y = height / 2;
    core.userData.bar = true;
    barGroup.add(core);
    const edgeMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: theme.barEdgeOpacity,
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), edgeMat);
    edges.position.copy(core.position);
    barGroup.add(edges);
    const topMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: theme.barTopOpacity,
    });
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL_SIZE * 0.72, CELL_SIZE * 0.72),
      topMat,
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = height + 0.001;
    barGroup.add(top);
    group.add(barGroup);
    bars.push({
      group: barGroup, coreMat, edgeMat, topMat,
      modelName: cell.modelName, cell,
      originalColor: color.clone(),
    });
  }
  scene.add(group);
  return { group, bars };
}

function disposeBars(group: THREE.Group) {
  group.traverse((obj) => {
    const asMesh = obj as THREE.Mesh;
    const asLine = obj as unknown as THREE.LineSegments;
    if (asMesh.isMesh) {
      asMesh.geometry?.dispose();
      const mat = asMesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    } else if (asLine.isLineSegments) {
      asLine.geometry?.dispose();
      (asLine.material as THREE.Material).dispose();
    }
  });
}

// ---------- ThreeCanvas ----------

interface AxisProjection {
  bucketLabels: Array<{ date: string; time: string; x: number; y: number }>;
  modelLabels: Array<{ text: string; color: string; x: number; y: number }>;
}

interface ThreeCanvasProps {
  dataset: GridDataset | null;
  disabledModels: Set<string>;
  isolatedModel: string | null;
  focusedCell: GridCell | null;
  cameraX: number;
  theme: ThemeConfig;
  /** Dashboard-level timezone (`useTimezone()`) — used for bucket-label MM/DD HH:MM formatting and the day-rollover check. */
  timeZone: string;
  onIsolate: (modelName: string | null) => void;
  onFocus: (cell: GridCell | null) => void;
  onAxisProjection: (projection: AxisProjection) => void;
  onContextLost: () => void;
}

function ThreeCanvas({
  dataset, disabledModels, isolatedModel, focusedCell, cameraX, theme, timeZone,
  onIsolate, onFocus, onAxisProjection, onContextLost,
}: ThreeCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const floorMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const dataGroupRef = useRef<THREE.Group | null>(null);
  const barsRef = useRef<BarHandle[]>([]);
  const gridMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const datasetRef = useRef<GridDataset | null>(null);
  const cameraXRef = useRef<number>(cameraX);
  cameraXRef.current = cameraX;
  const pitchRef = useRef<number>(PITCH_DEFAULT);
  const disabledModelsRef = useRef<Set<string>>(disabledModels);
  disabledModelsRef.current = disabledModels;
  const isolatedModelRef = useRef<string | null>(isolatedModel);
  isolatedModelRef.current = isolatedModel;
  // Same pattern as the other prop refs: keep `timeZone` reachable
  // from the long-lived per-frame `tick` closure inside the mount
  // useEffect. The mount effect deliberately doesn't take `timeZone`
  // as a dep — re-running it would tear down and rebuild the entire
  // three.js scene every time the user switched zones.
  const timeZoneRef = useRef<string>(timeZone);
  timeZoneRef.current = timeZone;
  const themeRef = useRef<ThemeConfig>(theme);
  themeRef.current = theme;
  const onIsolateRef = useRef(onIsolate);
  onIsolateRef.current = onIsolate;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onAxisProjectionRef = useRef(onAxisProjection);
  onAxisProjectionRef.current = onAxisProjection;

  // Focus animation:
  //   targetBarRef    — the bar we WANT to be focused on (null = default view)
  //   activeBarRef    — the bar we're currently animating toward/on (latched)
  //   progressRef     — linear 0..1 animation progress
  //   prevTimeRef     — last frame timestamp (for delta-time)
  // Behavior: if target matches active and progress<1, advance. If target is
  // null or different from active and progress>0, recede. When progress hits
  // 0 and target differs from active, swap active to target and start
  // advancing again. This produces a "retreat then re-launch" feel on
  // mid-flight target switches — simpler than blending two in-flight poses
  // and, surprisingly, looks good.
  const targetBarRef = useRef<BarHandle | null>(null);
  const activeBarRef = useRef<BarHandle | null>(null);
  const progressRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(themeRef.current.sceneBg);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(themeRef.current.sceneBg);
    scene.fog = new THREE.FogExp2(themeRef.current.fog, 0.04);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
    cameraRef.current = camera;

    const floorMat = new THREE.MeshBasicMaterial({ color: themeRef.current.floor });
    floorMaterialRef.current = floorMat;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    scene.add(floor);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const applySize = (w: number, h: number) => {
      if (w < 2 || h < 2) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      applyViewOffset();
    };
    const initialSizeRaf = requestAnimationFrame(() => {
      applySize(mount.clientWidth, mount.clientHeight);
    });
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) applySize(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height));
    });
    ro.observe(mount);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      // eslint-disable-next-line no-console
      console.warn('[CostTrend3D] WebGL context lost');
      onContextLost();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // --- Pointer interaction ---
    // Drag (primary button down): delta-Y changes pitch within clamps.
    // Tap (down → up with negligible movement): raycast at pointer — shift
    //   key branches to isolate, plain click triggers the focus animation.
    // Hover (pointer over canvas, no buttons): raycast continuously to find
    //   the bar under the cursor; the opacity-update block bumps that bar
    //   to full for a subtle "this is clickable" signal.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerActive = false;
    let dragging = false;
    let lastDragY = 0;

    // Tap-vs-drag discrimination. Any motion > TAP_MOVE_THRESHOLD or hold
    // > TAP_HOLD_MAX_MS promotes the gesture from "tap" to "drag".
    const TAP_MOVE_THRESHOLD = 4; // px
    const TAP_HOLD_MAX_MS = 400;
    const tapTrack = { downX: 0, downY: 0, downTime: 0, moved: false };

    const pickBarAtPointer = (): BarHandle | null => {
      if (barsRef.current.length === 0) return null;
      raycaster.setFromCamera(pointer, camera);
      const testables: THREE.Object3D[] = [];
      for (const bar of barsRef.current) {
        if (disabledModelsRef.current.has(bar.modelName)) continue;
        const core = bar.group.children[0];
        if (core) testables.push(core);
      }
      const hits = raycaster.intersectObjects(testables, false);
      if (hits.length === 0) return null;
      const hit = hits[0].object;
      return barsRef.current.find((b) => b.group.children[0] === hit) ?? null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerActive = true;
      if (dragging) {
        if (!tapTrack.moved) {
          const dist = Math.hypot(e.clientX - tapTrack.downX, e.clientY - tapTrack.downY);
          if (dist > TAP_MOVE_THRESHOLD) tapTrack.moved = true;
        }
        const dy = e.clientY - lastDragY;
        lastDragY = e.clientY;
        // Only apply tilt once the gesture is confirmed as a drag.
        if (tapTrack.moved) {
          pitchRef.current = Math.max(
            PITCH_MIN,
            Math.min(PITCH_MAX, pitchRef.current - dy * PITCH_DRAG_SENSITIVITY),
          );
        }
      }
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      lastDragY = e.clientY;
      tapTrack.downX = e.clientX;
      tapTrack.downY = e.clientY;
      tapTrack.downTime = performance.now();
      tapTrack.moved = false;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const handlePointerUp = (e: PointerEvent) => {
      const wasDragging = dragging;
      dragging = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
      if (!wasDragging) return;
      const held = performance.now() - tapTrack.downTime;
      if (!tapTrack.moved && held <= TAP_HOLD_MAX_MS) {
        const hit = pickBarAtPointer();
        if (e.shiftKey) {
          // Shift-click: toggle model isolation (the prior plain-click behavior).
          if (hit) {
            const current = isolatedModelRef.current;
            onIsolateRef.current(current === hit.modelName ? null : hit.modelName);
          } else if (isolatedModelRef.current !== null) {
            onIsolateRef.current(null);
          }
        } else {
          // Plain click: trigger the cinematic focus animation (or clear it).
          onFocusRef.current(hit ? hit.cell : null);
        }
      }
    };
    const handlePointerLeave = () => { pointerActive = false; };
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    // --- Animation loop ---
    let rafId = 0;
    const tmpSize = new THREE.Vector2();
    // Scratch vectors for per-frame pose interpolation (avoid allocs in the
    // hot path).
    const defaultPos = new THREE.Vector3();
    const defaultLookAt = new THREE.Vector3();
    const focusPos = new THREE.Vector3();
    const focusLookAt = new THREE.Vector3();
    const blendedPos = new THREE.Vector3();
    const blendedLookAt = new THREE.Vector3();
    // Scratch color for per-frame color restore. The idle-restore loop
    // writes material colors each frame (so a hover-tint cleans up when
    // the pointer leaves) and needs to re-evaluate the dim color per
    // frame against the current theme.
    const HOVER_WHITE = new THREE.Color(1, 1, 1);
    const HOVER_TINT = 0.35; // originalColor → lerp toward white by 0.35
    const tmpDimColor = new THREE.Color();

    const applyViewOffset = () => {
      renderer.getSize(tmpSize);
      const vw = tmpSize.x;
      const vh = tmpSize.y;
      if (vw < 2 || vh < 2) return;
      const off: number = Y_OFFSET_PX;
      if (off === 0) {
        camera.clearViewOffset();
      } else if (off > 0) {
        camera.setViewOffset(vw, vh + off, 0, off, vw, vh);
      } else {
        camera.setViewOffset(vw, vh - off, 0, 0, vw, vh);
      }
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.max(0, now - prevTimeRef.current);
      prevTimeRef.current = now;

      // --- Advance focus progress ---
      const target = targetBarRef.current;
      const active = activeBarRef.current;
      let progress = progressRef.current;
      const step = dt / FOCUS_DURATION_MS;

      if (target !== null && active === target) {
        // Already locked onto the right bar — advance.
        progress = Math.min(1, progress + step);
      } else if (target === null && active !== null) {
        // We want to leave focus mode.
        progress = Math.max(0, progress - step);
        if (progress === 0) activeBarRef.current = null;
      } else if (target !== null && active !== target) {
        // Target switched mid-animation. Retreat to 0 first, then re-launch
        // toward the new target once we land at default.
        progress = Math.max(0, progress - step);
        if (progress === 0) activeBarRef.current = target;
      } else if (target !== null && active === null) {
        // Just-decided focus — latch it.
        activeBarRef.current = target;
      }
      progressRef.current = progress;
      const eased = easeOutCubic(progress);

      // --- Compute default-view pose (strip scrubbing w/ pitch tilt) ---
      const sx = cameraXRef.current;
      defaultLookAt.set(sx, TARGET_Y, 0);
      const dPos = cameraPositionFor(sx, pitchRef.current);
      defaultPos.copy(dPos);

      // --- Compute focus pose (if we have an active bar) ---
      const currentActive = activeBarRef.current;
      if (currentActive) {
        const barPos = currentActive.group.position;
        const core = currentActive.group.children[0] as THREE.Mesh;
        const coreGeom = core.geometry as THREE.BoxGeometry;
        const h = coreGeom.parameters.height;
        focusLookAt.set(barPos.x + FOCUS_LOOKAT_X_OFFSET, h / 2, barPos.z);
        focusPos.set(barPos.x, h / 2 + FOCUS_ELEVATION, barPos.z + FOCUS_DISTANCE);
      } else {
        focusLookAt.copy(defaultLookAt);
        focusPos.copy(defaultPos);
      }

      // --- Blend ---
      blendedPos.copy(defaultPos).lerp(focusPos, eased);
      blendedLookAt.copy(defaultLookAt).lerp(focusLookAt, eased);
      const blendedFov = THREE.MathUtils.lerp(CAMERA_FOV, FOCUS_FOV, eased);
      if (Math.abs(camera.fov - blendedFov) > 0.01) {
        camera.fov = blendedFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(blendedPos);
      camera.lookAt(blendedLookAt);

      // --- Drive bar opacities from the focus animation ---
      // When eased=0, everything uses the theme's base opacities (handled in
      // the filter effect). When eased>0, we override here each frame:
      //   focused bar → lerp from base to focusedOpacity
      //   other bars  → lerp from base to dimOpacity
      // This is per-frame work proportional to bar count; 192 bars is fine.
      if (eased > 0 && currentActive) {
        const dimTarget = FOCUS_DIM_OPACITY;
        const focusTarget = FOCUS_BAR_OPACITY;
        const focused = currentActive;
        for (const bar of barsRef.current) {
          const disabled = disabledModelsRef.current.has(bar.modelName);
          const isolated = isolatedModelRef.current !== null
            && bar.modelName !== isolatedModelRef.current && !disabled;
          const soloed = isolatedModelRef.current !== null
            && bar.modelName === isolatedModelRef.current && !disabled;
          // Base opacities = what the filter effect would set without focus.
          let baseCore: number, baseEdge: number, baseTop: number;
          if (disabled) {
            baseCore = 0.03; baseEdge = 0.08; baseTop = 0.05;
          } else if (isolated) {
            baseCore = themeRef.current.dimCoreOpacity;
            baseEdge = themeRef.current.dimEdgeOpacity;
            baseTop = themeRef.current.dimTopOpacity;
          } else {
            // Soloed bar's sides push to top opacity so it reads solid.
            baseCore = soloed
              ? themeRef.current.barTopOpacity
              : themeRef.current.barCoreOpacity;
            baseEdge = themeRef.current.barEdgeOpacity;
            baseTop = themeRef.current.barTopOpacity;
          }
          if (bar === focused) {
            bar.coreMat.opacity = THREE.MathUtils.lerp(baseCore, focusTarget, eased);
            bar.edgeMat.opacity = THREE.MathUtils.lerp(baseEdge, Math.min(1, focusTarget + 0.1), eased);
            bar.topMat.opacity = THREE.MathUtils.lerp(baseTop, Math.min(1, focusTarget + 0.1), eased);
          } else {
            bar.coreMat.opacity = THREE.MathUtils.lerp(baseCore, dimTarget, eased);
            bar.edgeMat.opacity = THREE.MathUtils.lerp(baseEdge, dimTarget * 1.5, eased);
            bar.topMat.opacity = THREE.MathUtils.lerp(baseTop, dimTarget * 1.5, eased);
          }
        }
        // Grid fade follows the same curve.
        if (gridMaterialRef.current) {
          gridMaterialRef.current.opacity = THREE.MathUtils.lerp(
            themeRef.current.gridOpacity,
            themeRef.current.gridOpacity * 0.35,
            eased,
          );
        }
      } else if (eased === 0) {
        // Idle — restore base opacities in case the previous frame of a
        // retreat animation left anything mid-lerp, and apply the hover
        // highlight: the bar the pointer is currently over gets fully
        // opaque so clickability reads at a glance.
        let hoveredBar: BarHandle | null = null;
        if (pointerActive && !dragging && barsRef.current.length > 0) {
          raycaster.setFromCamera(pointer, camera);
          const testables: THREE.Object3D[] = [];
          for (const bar of barsRef.current) {
            if (disabledModelsRef.current.has(bar.modelName)) continue;
            const core = bar.group.children[0];
            if (core) testables.push(core);
          }
          const hits = raycaster.intersectObjects(testables, false);
          if (hits.length > 0) {
            const hit = hits[0].object;
            hoveredBar = barsRef.current.find((b) => b.group.children[0] === hit) ?? null;
          }
        }
        tmpDimColor.set(themeRef.current.isolatedDimColor);
        for (const bar of barsRef.current) {
          const disabled = disabledModelsRef.current.has(bar.modelName);
          const isolated = isolatedModelRef.current !== null
            && bar.modelName !== isolatedModelRef.current && !disabled;
          const soloed = isolatedModelRef.current !== null
            && bar.modelName === isolatedModelRef.current && !disabled;
          if (bar === hoveredBar && !disabled) {
            // Hover highlight — bar becomes fully solid AND shifts its
            // color toward white. Opacity alone isn't enough feedback
            // for a soloed bar (already near-solid); the tint guarantees
            // a visible hover cue in every state.
            bar.coreMat.opacity = 1;
            bar.edgeMat.opacity = 1;
            bar.topMat.opacity = 1;
            bar.coreMat.color.copy(bar.originalColor).lerp(HOVER_WHITE, HOVER_TINT);
            bar.edgeMat.color.copy(bar.originalColor).lerp(HOVER_WHITE, HOVER_TINT);
            bar.topMat.color.copy(bar.originalColor).lerp(HOVER_WHITE, HOVER_TINT);
          } else if (disabled) {
            bar.coreMat.opacity = 0.03;
            bar.edgeMat.opacity = 0.08;
            bar.topMat.opacity = 0.05;
            bar.coreMat.color.copy(bar.originalColor);
            bar.edgeMat.color.copy(bar.originalColor);
            bar.topMat.color.copy(bar.originalColor);
          } else if (isolated) {
            bar.coreMat.opacity = themeRef.current.dimCoreOpacity;
            bar.edgeMat.opacity = themeRef.current.dimEdgeOpacity;
            bar.topMat.opacity = themeRef.current.dimTopOpacity;
            bar.coreMat.color.copy(tmpDimColor);
            bar.edgeMat.color.copy(tmpDimColor);
            bar.topMat.color.copy(tmpDimColor);
          } else {
            // Soloed bar's sides push to top opacity so it reads solid.
            bar.coreMat.opacity = soloed
              ? themeRef.current.barTopOpacity
              : themeRef.current.barCoreOpacity;
            bar.edgeMat.opacity = themeRef.current.barEdgeOpacity;
            bar.topMat.opacity = themeRef.current.barTopOpacity;
            bar.coreMat.color.copy(bar.originalColor);
            bar.edgeMat.color.copy(bar.originalColor);
            bar.topMat.color.copy(bar.originalColor);
          }
        }
        if (gridMaterialRef.current) {
          gridMaterialRef.current.opacity = themeRef.current.gridOpacity;
        }
      }

      // Project axis labels (world → screen) for the HTML overlay.
      const ds = datasetRef.current;
      if (ds) {
        const rect = renderer.domElement.getBoundingClientRect();
        const toScreen = (w: THREE.Vector3) => {
          const v = w.clone().project(camera);
          return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
        };
        const spanZ = ds.models.length * CELL_SIZE;
        const spanX = ds.buckets.length * CELL_SIZE;
        const bucketLabels = ds.buckets.map((bucket, i) => {
          const x = layoutX(i, ds.buckets.length);
          const z = spanZ / 2 + 0.45;
          const s = toScreen(new THREE.Vector3(x, 0, z));
          const d = new Date(bucket);
          const c = zonedComponents(d, timeZoneRef.current);
          const date = `${c.month}/${c.day}`;
          const time = `${c.hour}:${c.minute}`;
          // Only print the date on the first bucket or whenever the calendar
          // day rolls over. Printing `MM/DD` on every hourly bucket produced a
          // wall of repeated "4/21"s — visual noise that hid the actual
          // timeline structure. The rollover check uses the SAME zone so a
          // user in Tokyo viewing UTC sees rollovers at UTC midnight, not at
          // their local midnight.
          let showDate = i === 0;
          if (!showDate) {
            const prev = zonedComponents(new Date(ds.buckets[i - 1]), timeZoneRef.current);
            showDate = prev.day !== c.day
              || prev.month !== c.month
              || prev.year !== c.year;
          }
          return { date: showDate ? date : '', time, x: s.x, y: s.y };
        });
        const activeTheme = themeRef.current;
        const modelLabels = ds.models.map((model, i) => {
          const color = hexForModel(activeTheme.modelPalette, i);
          const x = -spanX / 2 - 0.3;
          const z = layoutZ(i, ds.models.length);
          const s = toScreen(new THREE.Vector3(x, 0.1, z));
          return { text: model, color, x: s.x, y: s.y };
        });
        onAxisProjectionRef.current({ bucketLabels, modelLabels });
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(initialSizeRaf);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      if (dataGroupRef.current) {
        scene.remove(dataGroupRef.current);
        disposeBars(dataGroupRef.current);
        dataGroupRef.current = null;
        barsRef.current = [];
      }
      gridMaterialRef.current?.dispose();
      gridMaterialRef.current = null;
      floorMaterialRef.current?.dispose();
      floorMaterialRef.current = null;
      floor.geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [onContextLost]);

  // Rebuild data-dependent scene content (grid + bars) when dataset or
  // theme changes. Both affect material colors/opacities on every bar and
  // grid line, so the cleanest path is a full rebuild of the data group.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (dataGroupRef.current) {
      scene.remove(dataGroupRef.current);
      disposeBars(dataGroupRef.current);
      dataGroupRef.current = null;
      barsRef.current = [];
    }
    gridMaterialRef.current?.dispose();
    gridMaterialRef.current = null;

    datasetRef.current = dataset;
    if (!dataset) return;

    const dataGroup = new THREE.Group();
    const { grid, material: gridMaterial } = buildAlignedGrid(dataset, theme);
    dataGroup.add(grid);
    gridMaterialRef.current = gridMaterial;

    const { group: barsGroup, bars } = buildBars(scene, dataset, theme);
    scene.remove(barsGroup);
    dataGroup.add(barsGroup);
    barsRef.current = bars;

    scene.add(dataGroup);
    dataGroupRef.current = dataGroup;
  }, [dataset, theme]);

  // Sync scene-level theme colors (background, fog, floor) in place —
  // cheap and avoids tearing down the renderer on theme toggle.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    (scene.background as THREE.Color).set(theme.sceneBg);
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      (scene.fog as THREE.FogExp2).color.set(theme.fog);
    }
    floorMaterialRef.current?.color.set(theme.floor);
  }, [theme]);

  // Resolve the focused-cell prop to a BarHandle from the current bars array.
  // Both refs are updated in the same effect so the animation loop sees
  // consistent state.
  useEffect(() => {
    if (!focusedCell) {
      targetBarRef.current = null;
      return;
    }
    const match = barsRef.current.find(
      (b) => b.cell.modelName === focusedCell.modelName
        && b.cell.bucketTime === focusedCell.bucketTime,
    );
    targetBarRef.current = match ?? null;
  }, [focusedCell, dataset]);

  // Apply model filter + isolation. Four states per bar:
  //   disabled  — user toggled the model off in the legend. Near-invisible.
  //   dimmed    — another model is isolated. Desaturate to the theme's
  //               neutral dim color + reduce opacity so the bar sits back
  //               but keeps spatial context.
  //   soloed    — this bar IS the isolated model. Sides pushed up to
  //               match the top opacity so the solo'd bars read as solid
  //               blocks rather than the usual translucent wireframe.
  //   normal    — full color and opacity (as determined by theme).
  useEffect(() => {
    const dimColor = new THREE.Color(theme.isolatedDimColor);
    for (const bar of barsRef.current) {
      const disabled = disabledModels.has(bar.modelName);
      const dimmed = isolatedModel !== null && bar.modelName !== isolatedModel && !disabled;
      const soloed = isolatedModel !== null && bar.modelName === isolatedModel && !disabled;
      if (disabled) {
        bar.coreMat.color.copy(bar.originalColor);
        bar.edgeMat.color.copy(bar.originalColor);
        bar.topMat.color.copy(bar.originalColor);
        bar.coreMat.opacity = 0.03;
        bar.edgeMat.opacity = 0.08;
        bar.topMat.opacity = 0.05;
      } else if (dimmed) {
        bar.coreMat.color.copy(dimColor);
        bar.edgeMat.color.copy(dimColor);
        bar.topMat.color.copy(dimColor);
        bar.coreMat.opacity = theme.dimCoreOpacity;
        bar.edgeMat.opacity = theme.dimEdgeOpacity;
        bar.topMat.opacity = theme.dimTopOpacity;
      } else {
        bar.coreMat.color.copy(bar.originalColor);
        bar.edgeMat.color.copy(bar.originalColor);
        bar.topMat.color.copy(bar.originalColor);
        bar.coreMat.opacity = soloed ? theme.barTopOpacity : theme.barCoreOpacity;
        bar.edgeMat.opacity = theme.barEdgeOpacity;
        bar.topMat.opacity = theme.barTopOpacity;
      }
    }
  }, [disabledModels, isolatedModel, dataset, theme]);

  return (
    <div
      ref={mountRef}
      data-drag-exclude="true"
      // Intentionally wide-short: the 3D content (bars + grid + axis labels)
      // fills the frame vertically at the configured FOV. Width is driven
      // by the parent (.widget body) so the ratio stays widescreen. The
      // inline background matches the theme so the widget shows a coherent
      // color even during the brief moment before the WebGL context paints.
      style={{
        height: CANVAS_HEIGHT, borderRadius: 8, overflow: 'hidden',
        background: '#' + new THREE.Color(theme.sceneBg).getHexString(),
        position: 'relative',
      }}
    />
  );
}

// ---------- Outer component ----------

export default function CostTrend3D({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: TOPICS.llmCost,
    queryKey: ['cost-trends-3d'],
    refetchInterval: 60_000,
  });

  const [contextLost, setContextLost] = useState(false);
  const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set());
  const [isolatedModel, setIsolatedModel] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<GridCell | null>(null);
  const [axes, setAxes] = useState<AxisProjection>({ bucketLabels: [], modelLabels: [] });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const themeName = useThemeName();
  const themeColors = useThemeColors();
  // Override the per-theme `modelPalette` with the shared chart palette from
  // CSS tokens (`--chart-1`..`--chart-7`). This is the same source the 2D
  // widgets read, so the same model lands in the same color across 2D and 3D
  // (Brett review §4 H4 / OMN-149).
  const theme = useMemo<ThemeConfig>(() => {
    const base = themeName === 'dark' ? DARK_THEME : LIGHT_THEME;
    const palette = themeColors.chart.length > 0 ? themeColors.chart : base.modelPalette;
    return { ...base, modelPalette: palette };
  }, [themeName, themeColors]);
  const tz = useTimezone();

  // Escape clears focus.
  useEffect(() => {
    if (!focusedCell) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedCell(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedCell]);

  // Apply the dashboard-level time range before reshaping — the grid is
  // built from whatever falls inside the window. Widget declares
  // supports_time_range: true in its manifest.
  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolvedRange = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const filteredData = useMemo(
    () => applyTimeRange(data, (d) => d.bucket_time, resolvedRange),
    [data, resolvedRange],
  );
  const dataset = useMemo(
    () => (filteredData.length > 0 ? reshapeToGrid(filteredData) : null),
    [filteredData],
  );
  const isEmpty = !data || data.length === 0 || !dataset;

  // If the focused cell disappears from a new dataset, drop the focus.
  useEffect(() => {
    if (!focusedCell || !dataset) return;
    const still = dataset.cells.some(
      (c) => c.modelName === focusedCell.modelName && c.bucketTime === focusedCell.bucketTime,
    );
    if (!still) setFocusedCell(null);
  }, [dataset, focusedCell]);

  // Scrollbar state — camera X along the timeline.
  const scrollRange = useMemo(() => {
    if (!dataset) return { min: 0, max: 0, step: 0.01 };
    const bucketCount = dataset.buckets.length;
    const leftmost = layoutX(0, bucketCount);
    const rightmost = layoutX(bucketCount - 1, bucketCount);
    return { min: leftmost, max: rightmost, step: CELL_SIZE / 10 };
  }, [dataset]);
  const [cameraX, setCameraX] = useState<number>(0);
  // Reset to center whenever the dataset's extent changes.
  useEffect(() => {
    setCameraX((scrollRange.min + scrollRange.max) / 2);
  }, [scrollRange.min, scrollRange.max]);

  const handleContextLost = useCallback(() => setContextLost(true), []);
  const handleIsolate = useCallback((model: string | null) => setIsolatedModel(model), []);
  const handleFocus = useCallback((cell: GridCell | null) => setFocusedCell(cell), []);
  const handleAxes = useCallback((proj: AxisProjection) => setAxes(proj), []);

  const toggleModel = (model: string) => {
    setDisabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
    // If we're disabling the currently-isolated model, clear isolation so
    // the view isn't left showing only dimmed bars.
    if (isolatedModel === model) setIsolatedModel(null);
  };

  // Clear isolation if a fresh dataset doesn't include the isolated model.
  useEffect(() => {
    if (isolatedModel && dataset && !dataset.models.includes(isolatedModel)) {
      setIsolatedModel(null);
    }
  }, [dataset, isolatedModel]);

  return (
    <ComponentWrapper
      title="Cost Trend (3D)"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No cost data available"
      emptyHint="3D cost visualization renders after LLM calls are tracked"
    >
      {dataset && !isEmpty && (
        contextLost ? (
          <div style={{ padding: 16 }}>
            <Text as="div" size="lg" color="secondary" leading="loose" style={{ marginBottom: 8 }} weight="semibold">
              <Text color="bad" weight="semibold">WebGL context lost</Text>
            </Text>
            <Text as="div" size="lg" color="secondary" leading="loose" style={{ marginBottom: 12 }}>
              The 3D scene lost its WebGL context. This is usually transient.
            </Text>
            <button type="button" className="btn ghost" onClick={() => setContextLost(false)}>
              <Text size="md">Retry</Text>
            </button>
          </div>
        ) : (
          <div ref={containerRef} style={{ position: 'relative' }}>
            <ThreeCanvas
              dataset={dataset}
              disabledModels={disabledModels}
              isolatedModel={isolatedModel}
              focusedCell={focusedCell}
              cameraX={cameraX}
              theme={theme}
              timeZone={tz}
              onIsolate={handleIsolate}
              onFocus={handleFocus}
              onAxisProjection={handleAxes}
              onContextLost={handleContextLost}
            />

            {/* Stats panel — slides in from the right edge of the canvas
                during focus mode. Animation duration matches focusTuning
                .statsSlideMs. Sized to fill the right ~40% of the canvas. */}
            <div
              data-drag-exclude="true"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: '42%',
                maxHeight: CANVAS_HEIGHT - 20,
                overflow: 'auto',
                padding: '12px 14px',
                background: theme.tooltipBg,
                border: `1px solid ${theme.panelBorder}`,
                borderRadius: 8,
                boxShadow: themeName === 'dark'
                  ? '0 0 24px rgba(0, 229, 255, 0.15), 0 4px 16px rgba(0,0,0,0.4)'
                  : '0 6px 20px rgba(0,0,0,0.12)',
                transform: focusedCell ? 'translateX(0)' : 'translateX(calc(100% + 20px))',
                opacity: focusedCell ? 1 : 0,
                transition: `transform ${STATS_SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${STATS_SLIDE_MS}ms ease-out`,
                color: theme.tooltipText,
                pointerEvents: focusedCell ? 'auto' : 'none',
              }}
            >
              {focusedCell && (() => {
                const hoverColor = hexForModel(theme.modelPalette, focusedCell.modelIndex);
                const d = new Date(focusedCell.bucketTime);
                const dateStr = d.toLocaleDateString(undefined, { timeZone: tz });
                const timeStr = d.toLocaleTimeString(undefined, { timeZone: tz });
                const cpr = focusedCell.requestCount > 0
                  ? focusedCell.cost / focusedCell.requestCount : 0;
                const tpr = focusedCell.requestCount > 0
                  ? focusedCell.totalTokens / focusedCell.requestCount : 0;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: hoverColor,
                        boxShadow: themeName === 'dark' ? `0 0 8px ${hoverColor}` : 'none',
                      }} />
                      <Text family="mono" size="lg" weight="semibold" style={{ color: hoverColor }}>
                        {focusedCell.modelName}
                      </Text>
                      <button
                        type="button"
                        onClick={() => setFocusedCell(null)}
                        style={{
                          marginLeft: 'auto',
                          background: 'transparent',
                          border: `1px solid ${theme.panelBorder}`,
                          borderRadius: 3, padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                        aria-label="Close focus"
                      >
                        <Text family="mono" size="xs" style={{ color: theme.panelText }}>✕</Text>
                      </button>
                    </div>
                    <Text as="div" family="mono" size="sm" style={{ color: theme.tooltipSubtle, marginBottom: 12 }}>
                      {dateStr} · {timeStr}
                    </Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>cost</Text>
                      <Text family="mono" size="sm" weight="semibold" style={{ color: theme.tooltipValue }}>
                        ${focusedCell.cost.toFixed(4)}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>tokens</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedCell.totalTokens.toLocaleString()}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>requests</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedCell.requestCount}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>cost / request</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        ${cpr.toFixed(5)}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>tokens / request</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {tpr.toFixed(0)}
                      </Text>
                    </div>
                    <Text as="div" family="mono" size="xs" style={{ marginTop: 12, color: theme.tooltipSubtle }}>
                      esc to close · click elsewhere to clear
                    </Text>
                  </>
                );
              })()}
            </div>

            {/* Axis labels — HTML overlays, positions recomputed each frame
                from world→screen projection so they stay anchored as the
                camera tilts and pans. Sized to match the canvas exactly
                (not `inset: 0` over the whole containerRef) so labels
                projecting off the canvas's edges are clipped rather than
                spilling into the scrollbar / legend rows below. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: CANVAS_HEIGHT,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {axes.bucketLabels.map((l, i) => (
                <Text
                  as="div"
                  family="mono"
                  size="xs"
                  leading="tight"
                  key={`b-${i}`}
                  style={{
                    position: 'absolute',
                    left: l.x,
                    top: l.y,
                    transform: 'translate(-50%, 4px)',
                    color: theme.labelPrimary,
                    textShadow: theme.labelShadow,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  {l.date && <div>{l.date}</div>}
                  <Text as="div" family="mono" size="xs" style={{ color: theme.labelSecondary }}>{l.time}</Text>
                </Text>
              ))}
              {axes.modelLabels.map((l, i) => (
                <Text
                  as="div"
                  family="mono"
                  size="xs"
                  key={`m-${i}`}
                  style={{
                    position: 'absolute',
                    left: l.x,
                    top: l.y,
                    transform: 'translate(-100%, -50%)',
                    color: l.color,
                    textShadow: themeName === 'dark' ? `0 0 6px ${l.color}66` : 'none',
                    whiteSpace: 'nowrap',
                    paddingRight: 6,
                  }}
                >
                  {l.text}
                </Text>
              ))}
            </div>

            {/* Timeline scrollbar — only mechanism for horizontal navigation. */}
            <div
              data-drag-exclude="true"
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: theme.labelPrimary,
              }}
            >
              <Text as="span" family="mono" size="xs" leading="tight" style={{ minWidth: 52, textAlign: 'right', color: theme.labelPrimary }}>
                {(() => {
                  const c = zonedComponents(new Date(dataset.buckets[0]), tz);
                  const date = `${c.month}/${c.day}`;
                  const time = `${c.hour}:${c.minute}`;
                  return (
                    <>
                      <div>{date}</div>
                      <Text as="div" family="mono" size="xs" style={{ color: theme.labelSecondary }}>{time}</Text>
                    </>
                  );
                })()}
              </Text>
              <input
                type="range"
                min={scrollRange.min}
                max={scrollRange.max}
                step={scrollRange.step}
                value={cameraX}
                onChange={(e) => setCameraX(parseFloat(e.target.value))}
                aria-label="Scroll timeline"
                style={{ flex: 1, accentColor: theme.scrollbarAccent }}
              />
              <Text as="span" family="mono" size="xs" leading="tight" style={{ minWidth: 52, color: theme.labelPrimary }}>
                {(() => {
                  const c = zonedComponents(new Date(dataset.buckets[dataset.buckets.length - 1]), tz);
                  const date = `${c.month}/${c.day}`;
                  const time = `${c.hour}:${c.minute}`;
                  return (
                    <>
                      <div>{date}</div>
                      <Text as="div" family="mono" size="xs" style={{ color: theme.labelSecondary }}>{time}</Text>
                    </>
                  );
                })()}
              </Text>
            </div>

            {/* Model filter legend — horizontal row below the scrollbar so
                it can grow with more models without crowding the 3D view.
                Reserves a generous minHeight so additional rows of model
                chips (or future controls in the same panel) have space to
                live without layout jumping. */}
            <div
              data-drag-exclude="true"
              style={{
                marginTop: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                alignContent: 'flex-start',
                flexWrap: 'wrap',
                gap: 8,
                minHeight: 72,
                background: theme.panelBg,
                border: `1px solid ${theme.panelBorder}`,
                borderRadius: 6,
                color: theme.panelText,
              }}
            >
              <Text
                family="mono"
                size="xs"
                transform="uppercase"
                style={{ color: theme.panelHeader, marginRight: 4 }}
              >
                Models
              </Text>
              {dataset.models.map((model, i) => {
                const disabled = disabledModels.has(model);
                const isolated = isolatedModel === model;
                const color = hexForModel(theme.modelPalette, i);
                return (
                  <div
                    key={model}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      // Shift-click mirrors shift-click on a bar:
                      // toggle focus/isolation for this model. Plain
                      // click stays as the visibility toggle.
                      if (e.shiftKey) {
                        setIsolatedModel(isolatedModel === model ? null : model);
                        return;
                      }
                      toggleModel(model);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (e.shiftKey) {
                          setIsolatedModel(isolatedModel === model ? null : model);
                        } else {
                          toggleModel(model);
                        }
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: isolated ? `${color}22` : 'transparent',
                      border: `1px solid ${isolated ? color : theme.chipBorder}`,
                      cursor: 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      userSelect: 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: disabled ? 'transparent' : color,
                        border: `1px solid ${color}`,
                        boxShadow: disabled || themeName === 'light' ? 'none' : `0 0 6px ${color}`,
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      family="mono"
                      size="sm"
                      weight={isolated ? 'semibold' : 'regular'}
                      style={{
                        textDecoration: disabled ? 'line-through' : 'none',
                        color: isolated ? color : theme.panelText,
                      }}
                    >
                      {model}
                    </Text>
                  </div>
                );
              })}
              {isolatedModel && (
                <button
                  type="button"
                  onClick={() => setIsolatedModel(null)}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: `1px solid ${theme.panelBorder}`,
                    borderRadius: 3,
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <Text family="mono" size="xs" transform="uppercase" style={{ color: theme.panelText }}>
                    Clear focus
                  </Text>
                </button>
              )}
            </div>

          </div>
        )
      )}
    </ComponentWrapper>
  );
}

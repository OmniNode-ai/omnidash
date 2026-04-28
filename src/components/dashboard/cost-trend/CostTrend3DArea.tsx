// Experimental 3D Cost Trend (Area variant) — pairs with CostTrend3DBars.
// Same Tron aesthetic, same data, same controls. The Bars variant renders
// one column per (model × bucket); this variant renders one filled ribbon
// per model, with the ribbon's silhouette tracing the model's cost over
// time. Ribbons stack along Z so each model occupies its own depth row.
//
// Camera design (intentionally restrictive — same as Bars):
//   - Starts facing the strip head-on (looking down -Z).
//   - No free orbit / yaw. No scroll-wheel zoom. No drag-pan.
//   - Tilt (pitch) is the only free camera control, via mouse-down drag.
//   - Horizontal navigation along the timeline is via an HTML scrollbar.
//
// Compared to the Bars variant: the focus model is a whole MODEL (not a
// single cell), so click-to-focus brings up that model's totals in the
// stats panel instead of per-bucket stats. The cinematic camera swoop is
// retained but adapted — it pivots toward the focused ribbon's depth row
// instead of zooming onto a single column.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useTimezone } from '@/hooks/useTimezone';
import { useFrameStore } from '@/store/store';
import { useThemeName, useThemeColors } from '@/theme';
import { cssColorToHex } from '@/theme/cssColorToHex';
import { Text } from '@/components/ui/typography';
import { zonedComponents } from '@/lib/zonedComponents';

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
  ribbonOpacity: number;
  edgeOpacity: number;
  dimRibbonOpacity: number;
  dimEdgeOpacity: number;
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
  // Stacked layout: each ribbon is its own fully opaque band. The Z
  // stagger gives each model its own card-like layer, so we don't need
  // translucency to "see through" — we just need each band to be a
  // distinct, solid color.
  ribbonOpacity: 1.0,
  edgeOpacity: 0.95,
  dimRibbonOpacity: 0.08,
  dimEdgeOpacity: 0.22,
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

const LIGHT_THEME: ThemeConfig = {
  sceneBg: 0xffffff,
  fog: 0xffffff,
  floor: 0xf7f8fa,
  grid: 0x6b7280,
  gridOpacity: 0.6,
  isolatedDimColor: 0xa0a5b0,
  modelPalette: [
    '#8fd1d9', '#d9a5c4', '#e8c899', '#b5d5ad',
    '#bfb1e0', '#e0aa98', '#a7c2dd',
  ],
  ribbonOpacity: 1.0,
  edgeOpacity: 0.85,
  dimRibbonOpacity: 0.18,
  dimEdgeOpacity: 0.32,
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
const CANVAS_HEIGHT = 200;

function layoutX(bucketIndex: number, bucketCount: number): number {
  const span = bucketCount * CELL_SIZE;
  return bucketIndex * CELL_SIZE - span / 2 + CELL_SIZE / 2;
}
function layoutZ(modelIndex: number, modelCount: number): number {
  const span = modelCount * CELL_SIZE;
  return modelIndex * CELL_SIZE - span / 2 + CELL_SIZE / 2;
}

// ---------- Camera + focus animation constants ----------

const CAMERA_DISTANCE = 11;
const TARGET_Y = 0.6;
const CAMERA_FOV = 30;
const PITCH_DEFAULT = Math.PI / 2 - 0.30;
const PITCH_MIN = Math.PI / 2 - 0.55;
const PITCH_MAX = Math.PI / 2 - 0.05;
const PITCH_DRAG_SENSITIVITY = 0.005;
const Y_OFFSET_PX = -1;

const FOCUS_DURATION_MS = 900;
const FOCUS_FOV = 28; // slight zoom-in during focus
const FOCUS_DIM_OPACITY = 0.04;
const FOCUS_RIBBON_OPACITY = 0.95;
const STATS_SLIDE_MS = 900;

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function cameraPositionFor(targetX: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    targetX,
    TARGET_Y + CAMERA_DISTANCE * Math.cos(pitch),
    CAMERA_DISTANCE * Math.sin(pitch),
  );
}

// ---------- Grid ----------

function buildAlignedGrid(
  dataset: GridDataset, theme: ThemeConfig,
): { grid: THREE.LineSegments; material: THREE.LineBasicMaterial } {
  // Ridge plot: ribbons spread along Z one row per model. The grid mirrors
  // that — a row line at every model boundary plus bucket dividers spanning
  // the full Z extent. Each ribbon sits exactly within one row of the grid.
  const bucketCount = dataset.buckets.length;
  const modelCount = dataset.models.length;
  const spanX = bucketCount * CELL_SIZE;
  const spanZ = modelCount * CELL_SIZE;
  const positions: number[] = [];
  // Per-row floor lines (modelCount + 1 lines = one per row boundary).
  for (let i = 0; i <= modelCount; i++) {
    const z = i * CELL_SIZE - spanZ / 2;
    positions.push(-spanX / 2, 0, z, spanX / 2, 0, z);
  }
  // Bucket dividers, perpendicular to time axis, spanning full Z.
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

// ---------- Ribbons ----------

interface RibbonHandle {
  mesh: THREE.Mesh;            // filled ShapeGeometry
  edges: THREE.LineSegments;   // ribbon outline
  ribbonMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.LineBasicMaterial;
  modelName: string;
  modelIndex: number;
  z: number;                   // depth position
  centerX: number;             // X midpoint (mostly 0; useful for camera framing)
  totalCost: number;           // sum across visible buckets
  totalTokens: number;
  totalRequests: number;
  bucketCount: number;
  firstBucket: string;
  lastBucket: string;
  originalColor: THREE.Color;
}

function buildAreaRibbons(
  scene: THREE.Scene, dataset: GridDataset, theme: ThemeConfig,
): { group: THREE.Group; ribbons: RibbonHandle[] } {
  const group = new THREE.Group();
  const ribbons: RibbonHandle[] = [];

  const bucketCount = dataset.buckets.length;
  const modelCount = dataset.models.length;

  // Build (bucket × model) lookup matrices once. Models with no cell at a
  // given bucket contribute 0 — the ribbon still spans the full timeline
  // and just dips to the baseline at those buckets.
  const costAt: number[][] = [];
  const cellAt: Array<Array<GridCell | undefined>> = [];
  for (let bi = 0; bi < bucketCount; bi++) {
    costAt.push(new Array(modelCount).fill(0));
    cellAt.push(new Array(modelCount).fill(undefined));
  }
  for (const cell of dataset.cells) {
    costAt[cell.bucketIndex][cell.modelIndex] = cell.cost;
    cellAt[cell.bucketIndex][cell.modelIndex] = cell;
  }

  // Global Y normalization — every ridge uses the same scale (max single-
  // bucket cost across all models). This preserves magnitude comparison
  // between models: a model that costs 10× more than another reads as
  // 10× taller. Per-row scaling would lose that signal.
  const maxCost = Math.max(dataset.maxCost, 0.001);

  const xLeftOf = (bi: number) => layoutX(bi, bucketCount) - CELL_SIZE / 2;
  const xRightOf = (bi: number) => layoutX(bi, bucketCount) + CELL_SIZE / 2;
  const heightAt = (bi: number, mi: number) =>
    (costAt[bi][mi] / maxCost) * MAX_BAR_HEIGHT;

  for (let modelIndex = 0; modelIndex < modelCount; modelIndex++) {
    const modelName = dataset.models[modelIndex];
    const color = colorForModel(theme.modelPalette, modelIndex);
    // Ridge plot: each model gets its own depth row. Models are pre-sorted
    // by total cost desc in `dataset.models`, so the largest-cost model
    // sits at the back of the scene and smaller models step forward.
    // Tall back ribbons peek over short front ones for natural depth.
    const z = layoutZ(modelIndex, modelCount);

    // Step-area outline at this row's baseline (y=0). Bottom edge runs
    // along y=0 across the full timeline; top edge traces cost(t) with
    // each bucket holding its level across the bucket width and jumping
    // at boundaries — same per-bucket discrete read as the Bars variant.
    const shape = new THREE.Shape();
    shape.moveTo(xLeftOf(0), 0);
    shape.lineTo(xLeftOf(0), heightAt(0, modelIndex));
    for (let bi = 0; bi < bucketCount; bi++) {
      shape.lineTo(xRightOf(bi), heightAt(bi, modelIndex));
      if (bi + 1 < bucketCount) {
        shape.lineTo(xLeftOf(bi + 1), heightAt(bi + 1, modelIndex));
      }
    }
    shape.lineTo(xRightOf(bucketCount - 1), 0);
    shape.lineTo(xLeftOf(0), 0);

    const geom = new THREE.ShapeGeometry(shape);
    const ribbonMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: theme.ribbonOpacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, ribbonMat);
    mesh.position.z = z;
    mesh.userData.ribbon = true;
    group.add(mesh);

    const edgeMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: theme.edgeOpacity,
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom), edgeMat);
    edges.position.z = z;
    group.add(edges);

    // Aggregate stats — only count buckets where this model has data.
    let totalCost = 0;
    let totalTokens = 0;
    let totalRequests = 0;
    let firstBucket = '';
    let lastBucket = '';
    let participatingBuckets = 0;
    for (let bi = 0; bi < bucketCount; bi++) {
      const cell = cellAt[bi][modelIndex];
      if (cell) {
        totalCost += cell.cost;
        totalTokens += cell.totalTokens;
        totalRequests += cell.requestCount;
        if (!firstBucket) firstBucket = cell.bucketTime;
        lastBucket = cell.bucketTime;
        participatingBuckets += 1;
      }
    }

    ribbons.push({
      mesh, edges, ribbonMat, edgeMat,
      modelName, modelIndex,
      z,
      centerX: (xLeftOf(0) + xRightOf(bucketCount - 1)) / 2,
      totalCost, totalTokens, totalRequests,
      bucketCount: participatingBuckets,
      firstBucket: firstBucket || dataset.buckets[0],
      lastBucket: lastBucket || dataset.buckets[bucketCount - 1],
      originalColor: color.clone(),
    });
  }

  scene.add(group);
  return { group, ribbons };
}

function disposeRibbons(group: THREE.Group) {
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
  focusedModel: string | null;
  cameraX: number;
  theme: ThemeConfig;
  timeZone: string;
  onIsolate: (modelName: string | null) => void;
  onFocus: (modelName: string | null) => void;
  onAxisProjection: (projection: AxisProjection) => void;
  onContextLost: () => void;
}

function ThreeCanvas({
  dataset, disabledModels, isolatedModel, focusedModel, cameraX, theme, timeZone,
  onIsolate, onFocus, onAxisProjection, onContextLost,
}: ThreeCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const floorMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const dataGroupRef = useRef<THREE.Group | null>(null);
  const ribbonsRef = useRef<RibbonHandle[]>([]);
  const gridMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const datasetRef = useRef<GridDataset | null>(null);
  const cameraXRef = useRef<number>(cameraX);
  cameraXRef.current = cameraX;
  const pitchRef = useRef<number>(PITCH_DEFAULT);
  const disabledModelsRef = useRef<Set<string>>(disabledModels);
  disabledModelsRef.current = disabledModels;
  const isolatedModelRef = useRef<string | null>(isolatedModel);
  isolatedModelRef.current = isolatedModel;
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

  // Focus animation state — same retreat-and-relaunch pattern as Bars,
  // but the "target" is a RibbonHandle (one per model) instead of a per-cell BarHandle.
  const targetRibbonRef = useRef<RibbonHandle | null>(null);
  const activeRibbonRef = useRef<RibbonHandle | null>(null);
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
      console.warn('[CostTrend3DArea] WebGL context lost');
      onContextLost();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // --- Pointer interaction ---
    // Same gesture model as Bars: drag-Y tilts pitch; tap raycasts for
    // focus / shift-isolate. The raycast target here is the ribbon mesh,
    // not a per-cell column.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerActive = false;
    let dragging = false;
    let lastDragY = 0;

    const TAP_MOVE_THRESHOLD = 4;
    const TAP_HOLD_MAX_MS = 400;
    const tapTrack = { downX: 0, downY: 0, downTime: 0, moved: false };

    const pickRibbonAtPointer = (): RibbonHandle | null => {
      if (ribbonsRef.current.length === 0) return null;
      raycaster.setFromCamera(pointer, camera);
      const testables: THREE.Object3D[] = [];
      for (const ribbon of ribbonsRef.current) {
        if (disabledModelsRef.current.has(ribbon.modelName)) continue;
        testables.push(ribbon.mesh);
      }
      const hits = raycaster.intersectObjects(testables, false);
      if (hits.length === 0) return null;
      const hit = hits[0].object;
      return ribbonsRef.current.find((r) => r.mesh === hit) ?? null;
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
        const hit = pickRibbonAtPointer();
        if (e.shiftKey) {
          // Shift-click: toggle model isolation (matches Bars).
          if (hit) {
            const current = isolatedModelRef.current;
            onIsolateRef.current(current === hit.modelName ? null : hit.modelName);
          } else if (isolatedModelRef.current !== null) {
            onIsolateRef.current(null);
          }
        } else {
          // Plain click on a ribbon: focus its model. Click on empty:
          // clear focus (mirrors the Bars escape gesture).
          onFocusRef.current(hit ? hit.modelName : null);
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
    const defaultPos = new THREE.Vector3();
    const defaultLookAt = new THREE.Vector3();
    const focusPos = new THREE.Vector3();
    const focusLookAt = new THREE.Vector3();
    const blendedPos = new THREE.Vector3();
    const blendedLookAt = new THREE.Vector3();
    const HOVER_WHITE = new THREE.Color(1, 1, 1);
    const HOVER_TINT = 0.35;
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
      const target = targetRibbonRef.current;
      const active = activeRibbonRef.current;
      let progress = progressRef.current;
      const step = dt / FOCUS_DURATION_MS;

      if (target !== null && active === target) {
        progress = Math.min(1, progress + step);
      } else if (target === null && active !== null) {
        progress = Math.max(0, progress - step);
        if (progress === 0) activeRibbonRef.current = null;
      } else if (target !== null && active !== target) {
        progress = Math.max(0, progress - step);
        if (progress === 0) activeRibbonRef.current = target;
      } else if (target !== null && active === null) {
        activeRibbonRef.current = target;
      }
      progressRef.current = progress;
      const eased = easeOutCubic(progress);

      // --- Compute default-view pose (strip scrubbing w/ pitch tilt) ---
      const sx = cameraXRef.current;
      defaultLookAt.set(sx, TARGET_Y, 0);
      const dPos = cameraPositionFor(sx, pitchRef.current);
      defaultPos.copy(dPos);

      // --- Compute focus pose ---
      // For a focused ribbon, swing the camera toward that ribbon's
      // depth row so it's seen broadside rather than edge-on. The
      // target X is preserved (so the user keeps the time slice they
      // were already viewing) but the look-at z and camera z shift to
      // align with the ribbon. The vertical pose lifts slightly to
      // give a 3/4 angle on the ribbon's surface.
      const currentActive = activeRibbonRef.current;
      if (currentActive) {
        focusLookAt.set(sx, MAX_BAR_HEIGHT * 0.35, currentActive.z);
        focusPos.set(sx, TARGET_Y + 3, currentActive.z + 5);
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

      // --- Drive ribbon opacities from the focus animation ---
      // Same logic shape as Bars, simplified for ribbons (ribbon mesh +
      // edges only — no separate "top face").
      if (eased > 0 && currentActive) {
        const dimTarget = FOCUS_DIM_OPACITY;
        const focusTarget = FOCUS_RIBBON_OPACITY;
        for (const ribbon of ribbonsRef.current) {
          const disabled = disabledModelsRef.current.has(ribbon.modelName);
          const isolated = isolatedModelRef.current !== null
            && ribbon.modelName !== isolatedModelRef.current && !disabled;
          let baseRibbon: number, baseEdge: number;
          if (disabled) {
            baseRibbon = 0.03; baseEdge = 0.08;
          } else if (isolated) {
            baseRibbon = themeRef.current.dimRibbonOpacity;
            baseEdge = themeRef.current.dimEdgeOpacity;
          } else {
            baseRibbon = themeRef.current.ribbonOpacity;
            baseEdge = themeRef.current.edgeOpacity;
          }
          if (ribbon === currentActive) {
            ribbon.ribbonMat.opacity = THREE.MathUtils.lerp(baseRibbon, focusTarget, eased);
            ribbon.edgeMat.opacity = THREE.MathUtils.lerp(baseEdge, 1, eased);
          } else {
            ribbon.ribbonMat.opacity = THREE.MathUtils.lerp(baseRibbon, dimTarget, eased);
            ribbon.edgeMat.opacity = THREE.MathUtils.lerp(baseEdge, dimTarget * 1.5, eased);
          }
        }
        if (gridMaterialRef.current) {
          gridMaterialRef.current.opacity = THREE.MathUtils.lerp(
            themeRef.current.gridOpacity,
            themeRef.current.gridOpacity * 0.35,
            eased,
          );
        }
      } else if (eased === 0) {
        // Idle — restore base opacities + apply hover highlight.
        let hoveredRibbon: RibbonHandle | null = null;
        if (pointerActive && !dragging && ribbonsRef.current.length > 0) {
          raycaster.setFromCamera(pointer, camera);
          const testables: THREE.Object3D[] = [];
          for (const ribbon of ribbonsRef.current) {
            if (disabledModelsRef.current.has(ribbon.modelName)) continue;
            testables.push(ribbon.mesh);
          }
          const hits = raycaster.intersectObjects(testables, false);
          if (hits.length > 0) {
            const hit = hits[0].object;
            hoveredRibbon = ribbonsRef.current.find((r) => r.mesh === hit) ?? null;
          }
        }
        // Cursor affordance on the canvas — pointer when over a ribbon.
        renderer.domElement.style.cursor = hoveredRibbon ? 'pointer' : 'default';

        tmpDimColor.set(themeRef.current.isolatedDimColor);
        for (const ribbon of ribbonsRef.current) {
          const disabled = disabledModelsRef.current.has(ribbon.modelName);
          const isolated = isolatedModelRef.current !== null
            && ribbon.modelName !== isolatedModelRef.current && !disabled;
          if (ribbon === hoveredRibbon && !disabled) {
            // Hover highlight — solid + tint toward white.
            ribbon.ribbonMat.opacity = Math.min(1, themeRef.current.ribbonOpacity + 0.3);
            ribbon.edgeMat.opacity = 1;
            ribbon.ribbonMat.color.copy(ribbon.originalColor).lerp(HOVER_WHITE, HOVER_TINT);
            ribbon.edgeMat.color.copy(ribbon.originalColor).lerp(HOVER_WHITE, HOVER_TINT);
          } else if (disabled) {
            ribbon.ribbonMat.opacity = 0.03;
            ribbon.edgeMat.opacity = 0.08;
            ribbon.ribbonMat.color.copy(ribbon.originalColor);
            ribbon.edgeMat.color.copy(ribbon.originalColor);
          } else if (isolated) {
            ribbon.ribbonMat.opacity = themeRef.current.dimRibbonOpacity;
            ribbon.edgeMat.opacity = themeRef.current.dimEdgeOpacity;
            ribbon.ribbonMat.color.copy(tmpDimColor);
            ribbon.edgeMat.color.copy(tmpDimColor);
          } else {
            ribbon.ribbonMat.opacity = themeRef.current.ribbonOpacity;
            ribbon.edgeMat.opacity = themeRef.current.edgeOpacity;
            ribbon.ribbonMat.color.copy(ribbon.originalColor);
            ribbon.edgeMat.color.copy(ribbon.originalColor);
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
        // Ridge plot: ribbons spread along Z by model. Bucket labels go in
        // front of the foremost row; model labels go at the left edge of
        // each row, projected to screen via the row's own Z position.
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
          // Print the date only on rollover.
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
        disposeRibbons(dataGroupRef.current);
        dataGroupRef.current = null;
        ribbonsRef.current = [];
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

  // Rebuild data-dependent scene content (grid + ribbons) when dataset
  // or theme changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (dataGroupRef.current) {
      scene.remove(dataGroupRef.current);
      disposeRibbons(dataGroupRef.current);
      dataGroupRef.current = null;
      ribbonsRef.current = [];
    }
    gridMaterialRef.current?.dispose();
    gridMaterialRef.current = null;

    datasetRef.current = dataset;
    if (!dataset) return;

    const dataGroup = new THREE.Group();
    const { grid, material: gridMaterial } = buildAlignedGrid(dataset, theme);
    dataGroup.add(grid);
    gridMaterialRef.current = gridMaterial;

    const { group: ribbonsGroup, ribbons } = buildAreaRibbons(scene, dataset, theme);
    scene.remove(ribbonsGroup);
    dataGroup.add(ribbonsGroup);
    ribbonsRef.current = ribbons;

    scene.add(dataGroup);
    dataGroupRef.current = dataGroup;
  }, [dataset, theme]);

  // Sync scene-level theme colors in place.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    (scene.background as THREE.Color).set(theme.sceneBg);
    if (scene.fog && (scene.fog as THREE.FogExp2).color) {
      (scene.fog as THREE.FogExp2).color.set(theme.fog);
    }
    floorMaterialRef.current?.color.set(theme.floor);
  }, [theme]);

  // Resolve the focused-model prop to a RibbonHandle from the current
  // ribbons array.
  useEffect(() => {
    if (!focusedModel) {
      targetRibbonRef.current = null;
      return;
    }
    const match = ribbonsRef.current.find((r) => r.modelName === focusedModel);
    targetRibbonRef.current = match ?? null;
  }, [focusedModel, dataset]);

  // Apply model filter + isolation. Three states per ribbon:
  //   disabled  — user toggled the model off in the legend. Near-invisible.
  //   dimmed    — another model is isolated. Desaturate to dim color.
  //   normal    — full color and opacity (theme defaults).
  useEffect(() => {
    const dimColor = new THREE.Color(theme.isolatedDimColor);
    for (const ribbon of ribbonsRef.current) {
      const disabled = disabledModels.has(ribbon.modelName);
      const dimmed = isolatedModel !== null && ribbon.modelName !== isolatedModel && !disabled;
      if (disabled) {
        ribbon.ribbonMat.color.copy(ribbon.originalColor);
        ribbon.edgeMat.color.copy(ribbon.originalColor);
        ribbon.ribbonMat.opacity = 0.03;
        ribbon.edgeMat.opacity = 0.08;
      } else if (dimmed) {
        ribbon.ribbonMat.color.copy(dimColor);
        ribbon.edgeMat.color.copy(dimColor);
        ribbon.ribbonMat.opacity = theme.dimRibbonOpacity;
        ribbon.edgeMat.opacity = theme.dimEdgeOpacity;
      } else {
        ribbon.ribbonMat.color.copy(ribbon.originalColor);
        ribbon.edgeMat.color.copy(ribbon.originalColor);
        ribbon.ribbonMat.opacity = theme.ribbonOpacity;
        ribbon.edgeMat.opacity = theme.edgeOpacity;
      }
    }
  }, [disabledModels, isolatedModel, dataset, theme]);

  return (
    <div
      ref={mountRef}
      data-drag-exclude="true"
      style={{
        height: CANVAS_HEIGHT, borderRadius: 8, overflow: 'hidden',
        background: '#' + new THREE.Color(theme.sceneBg).getHexString(),
        position: 'relative',
      }}
    />
  );
}

// ---------- Outer component ----------

export default function CostTrend3DArea({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: TOPICS.llmCost,
    queryKey: ['cost-trends-3d-area'],
    refetchInterval: 60_000,
  });

  const [contextLost, setContextLost] = useState(false);
  const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set());
  const [isolatedModel, setIsolatedModel] = useState<string | null>(null);
  const [focusedModel, setFocusedModel] = useState<string | null>(null);
  const [axes, setAxes] = useState<AxisProjection>({ bucketLabels: [], modelLabels: [] });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const themeName = useThemeName();
  const themeColors = useThemeColors();
  // Override the per-theme `modelPalette` with the shared chart palette
  // from CSS tokens. Same wiring as CostTrend3DBars (both 3D variants
  // need oklch → hex conversion for THREE.Color).
  const theme = useMemo<ThemeConfig>(() => {
    const base = themeName === 'dark' ? DARK_THEME : LIGHT_THEME;
    const palette = themeColors.chart.length > 0
      ? themeColors.chart.map((c) => '#' + cssColorToHex(c).toString(16).padStart(6, '0'))
      : base.modelPalette;
    return { ...base, modelPalette: palette };
  }, [themeName, themeColors]);
  const tz = useTimezone();

  // Escape clears focus.
  useEffect(() => {
    if (!focusedModel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedModel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedModel]);

  // Apply dashboard-level time range before reshaping.
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

  // If the focused model disappears from a new dataset, drop the focus.
  useEffect(() => {
    if (!focusedModel || !dataset) return;
    if (!dataset.models.includes(focusedModel)) setFocusedModel(null);
  }, [dataset, focusedModel]);

  // Stats for the focus panel — recomputed when the dataset or focused
  // model changes. For a focused model, sum cost / tokens / requests
  // across all buckets in the current view.
  const focusedStats = useMemo(() => {
    if (!focusedModel || !dataset) return null;
    const cells = dataset.cells.filter((c) => c.modelName === focusedModel);
    if (cells.length === 0) return null;
    let totalCost = 0;
    let totalTokens = 0;
    let totalRequests = 0;
    let firstBucket = cells[0].bucketTime;
    let lastBucket = cells[0].bucketTime;
    for (const cell of cells) {
      totalCost += cell.cost;
      totalTokens += cell.totalTokens;
      totalRequests += cell.requestCount;
      if (cell.bucketTime < firstBucket) firstBucket = cell.bucketTime;
      if (cell.bucketTime > lastBucket) lastBucket = cell.bucketTime;
    }
    const cpr = totalRequests > 0 ? totalCost / totalRequests : 0;
    const tpr = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const modelIndex = dataset.models.indexOf(focusedModel);
    return { totalCost, totalTokens, totalRequests, firstBucket, lastBucket, cpr, tpr, modelIndex, bucketCount: cells.length };
  }, [focusedModel, dataset]);

  // Scrollbar state.
  const scrollRange = useMemo(() => {
    if (!dataset) return { min: 0, max: 0, step: 0.01 };
    const bucketCount = dataset.buckets.length;
    const leftmost = layoutX(0, bucketCount);
    const rightmost = layoutX(bucketCount - 1, bucketCount);
    return { min: leftmost, max: rightmost, step: CELL_SIZE / 10 };
  }, [dataset]);
  const [cameraX, setCameraX] = useState<number>(0);
  useEffect(() => {
    setCameraX((scrollRange.min + scrollRange.max) / 2);
  }, [scrollRange.min, scrollRange.max]);

  const handleContextLost = useCallback(() => setContextLost(true), []);
  const handleIsolate = useCallback((model: string | null) => setIsolatedModel(model), []);
  const handleFocus = useCallback((model: string | null) => setFocusedModel(model), []);
  const handleAxes = useCallback((proj: AxisProjection) => setAxes(proj), []);

  const toggleModel = (model: string) => {
    setDisabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
    if (isolatedModel === model) setIsolatedModel(null);
    if (focusedModel === model) setFocusedModel(null);
  };

  // Clear isolation if a fresh dataset doesn't include the isolated model.
  useEffect(() => {
    if (isolatedModel && dataset && !dataset.models.includes(isolatedModel)) {
      setIsolatedModel(null);
    }
  }, [dataset, isolatedModel]);

  return (
    <ComponentWrapper
      title="Cost Trend"
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
              focusedModel={focusedModel}
              cameraX={cameraX}
              theme={theme}
              timeZone={tz}
              onIsolate={handleIsolate}
              onFocus={handleFocus}
              onAxisProjection={handleAxes}
              onContextLost={handleContextLost}
            />

            {/* Stats panel — slides in from the right edge of the canvas
                during focus mode. Shows the focused MODEL's totals across
                the current time window (not per-cell stats — ribbons
                don't have discrete cells). */}
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
                transform: focusedModel ? 'translateX(0)' : 'translateX(calc(100% + 20px))',
                opacity: focusedModel ? 1 : 0,
                transition: `transform ${STATS_SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${STATS_SLIDE_MS}ms ease-out`,
                color: theme.tooltipText,
                pointerEvents: focusedModel ? 'auto' : 'none',
              }}
            >
              {focusedModel && focusedStats && (() => {
                const hoverColor = hexForModel(theme.modelPalette, focusedStats.modelIndex);
                const startD = new Date(focusedStats.firstBucket);
                const endD = new Date(focusedStats.lastBucket);
                const startStr = `${startD.toLocaleDateString(undefined, { timeZone: tz, month: 'numeric', day: 'numeric' })} ${startD.toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}`;
                const endStr = `${endD.toLocaleDateString(undefined, { timeZone: tz, month: 'numeric', day: 'numeric' })} ${endD.toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit' })}`;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: hoverColor,
                        boxShadow: themeName === 'dark' ? `0 0 8px ${hoverColor}` : 'none',
                      }} />
                      <Text family="mono" size="lg" weight="semibold" style={{ color: hoverColor }}>
                        {focusedModel}
                      </Text>
                      <button
                        type="button"
                        onClick={() => setFocusedModel(null)}
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
                      {startStr} → {endStr}
                    </Text>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>total cost</Text>
                      <Text family="mono" size="sm" weight="semibold" style={{ color: theme.tooltipValue }}>
                        ${focusedStats.totalCost.toFixed(4)}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>total tokens</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedStats.totalTokens.toLocaleString()}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>requests</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedStats.totalRequests.toLocaleString()}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>buckets</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedStats.bucketCount}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>cost / request</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        ${focusedStats.cpr.toFixed(5)}
                      </Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipSubtle }}>tokens / request</Text>
                      <Text family="mono" size="sm" style={{ color: theme.tooltipValue }}>
                        {focusedStats.tpr.toFixed(0)}
                      </Text>
                    </div>
                    <Text as="div" family="mono" size="xs" style={{ marginTop: 12, color: theme.tooltipSubtle }}>
                      esc to close · click elsewhere to clear
                    </Text>
                  </>
                );
              })()}
            </div>

            {/* Axis labels — HTML overlays positioned via world→screen
                projection. */}
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

            {/* Timeline scrollbar. */}
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

            {/* Model filter legend. Plain click = toggle visibility,
                shift-click = isolate (matches Bars). Click directly on a
                ribbon in the scene = focus that model. */}
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

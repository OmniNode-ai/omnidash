// 3D doughnut chart for DelegationMetrics (OMN-129). Visual sibling
// of CostByModelPie — same tilted-on-XZ posture, same lighting and
// theme conventions, same hover-pop interaction. Differences:
//   - Doughnut shape: each slice is a wedge of an annulus, not a
//     full pie wedge. Inner radius is non-zero, leaving a hole.
//   - Slow continuous rotation around Y. Pauses on hover so users
//     can read the labels without chasing a moving target.
//   - Labels rendered via `CSS2DRenderer` as real DOM elements
//     positioned in 3D space. Native browser font rendering means
//     they're sharp at any zoom — the previous canvas-texture
//     `THREE.Sprite` approach produced bilinear-sampling blur that
//     was particularly visible on the smaller font sizes the user
//     wanted. Each label sits at the top of a vertical "skewer"
//     line rising from the slice's surface; the labels track their
//     slice as the doughnut spins.
//
// Architecture matches the CostByModelPie scaffold so future visual
// changes can be ported between the two without divergence: per-theme
// material/lighting knobs, scene-mounted lights that survive
// data refreshes, and a separate hover-pop effect that mutates mesh
// positions without rebuilding the doughnut.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Text } from '@/components/ui/typography';
import { useThemeColors, useThemeName, cssColorToHex } from '@/theme';

export interface DoughnutSlice {
  label: string;
  value: number;
  /** Pre-computed share 0..100. */
  percentage: number;
}

interface SliceHandle {
  /** Per-slice subgroup containing the wedge mesh, the skewer line, and the
   *  label sprite. Hover-pop translates this whole group so the candle
   *  travels with the slice instead of staying behind. */
  group: THREE.Group;
  /** Wedge mesh kept on the handle for raycasting; raycaster needs Mesh, not Group. */
  mesh: THREE.Mesh;
  midAngle: number;
  sliceIdx: number;
}

interface HoverInfo {
  sliceIdx: number;
  clientX: number;
  clientY: number;
}

// ---------- Geometry constants ----------

const OUTER_R = 1.0;
const INNER_R = 0.5;
const THICKNESS = 0.18;
const POP_OUT = 0.09;
const CURVE_SEGMENTS = 64;

// Vertical-skewer label layout. Each slice gets a "candle":
//   - a vertical line rising from the slice's top surface
//   - a label sprite at the top of the line
// The skewer's base sits at the slice's radial centroid (midway
// between inner and outer rim) so it visually anchors to the slice
// rather than the rim.
const SKEWER_BASE_RADIUS = (INNER_R + OUTER_R) / 2;
const SKEWER_LENGTH = 0.55;
const SKEWER_LABEL_GAP = 0.02; // small gap between line top and label bottom

// One full revolution every ~30 seconds — slow enough to read labels
// but obviously alive. Pauses on hover via the rotation-paused flag
// below.
const RADIANS_PER_SECOND = (Math.PI * 2) / 30;

/**
 * Trace one wedge of an annulus as a closed shape: outer arc forward,
 * radial line in, inner arc backward, radial line out. Suitable for
 * `ExtrudeGeometry` — produces a doughnut slice.
 */
function buildDoughnutSliceShape(startAngle: number, endAngle: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(OUTER_R * Math.cos(startAngle), OUTER_R * Math.sin(startAngle));
  shape.absarc(0, 0, OUTER_R, startAngle, endAngle, false);
  shape.lineTo(INNER_R * Math.cos(endAngle), INNER_R * Math.sin(endAngle));
  shape.absarc(0, 0, INNER_R, endAngle, startAngle, true);
  shape.lineTo(OUTER_R * Math.cos(startAngle), OUTER_R * Math.sin(startAngle));
  return shape;
}

// ---------- Theme ----------

type DoughnutMaterialKind = 'standard' | 'basic';
interface DoughnutTheme {
  materialKind: DoughnutMaterialKind;
  ambient: number;
  keyIntensity: number;
  sliceMetalness: number;
  sliceRoughness: number;
  emissiveIntensity: number;
  canvasBgCss: string;
  groundHex: number;
  /** CSS color for label sprite text. */
  labelTextColor: string;
  /** Hex color for the leader lines. */
  leaderLineHex: number;
}

const DARK_DOUGHNUT_THEME: DoughnutTheme = {
  materialKind: 'standard',
  ambient: 0.55,
  keyIntensity: 0.9,
  sliceMetalness: 0.15,
  sliceRoughness: 0.45,
  emissiveIntensity: 0.12,
  canvasBgCss: 'var(--panel-2)',
  groundHex: 0x020812,
  labelTextColor: '#cfe8ff',
  leaderLineHex: 0x9ad6ff,
};

const LIGHT_DOUGHNUT_THEME: DoughnutTheme = {
  materialKind: 'basic',
  ambient: 0,
  keyIntensity: 0,
  sliceMetalness: 0,
  sliceRoughness: 0,
  emissiveIntensity: 0,
  canvasBgCss: 'var(--panel-2)',
  groundHex: 0xf7f8fa,
  labelTextColor: '#0a0d12',
  leaderLineHex: 0x6b7580,
};

// ---------- DOM label helper ----------

/**
 * Build a `CSS2DObject` carrying a `<div>` with the slice's label
 * text. `CSS2DRenderer` projects the object's world position into
 * screen space each frame and translates the DOM element to match —
 * so the label tracks its slice through the doughnut's rotation
 * while the text itself is rendered natively by the browser at the
 * device's pixel ratio. No texture, no bilinear blur.
 *
 * `center` anchors the BOTTOM-center of the element at the world
 * position, so positioning the label at the top of a vertical
 * skewer line makes the text sit directly on the skewer's tip with
 * the text extending upward.
 */
function makeLabelObject(text: string, color: string): CSS2DObject {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.fontFamily = "'IBM Plex Sans', system-ui, sans-serif";
  el.style.fontSize = '11px';
  el.style.fontWeight = '600';
  el.style.lineHeight = '1';
  el.style.color = color;
  el.style.whiteSpace = 'nowrap';
  el.style.userSelect = 'none';
  // Disable pointer-events so the slice mesh below stays raycastable
  // even when the cursor is over a label.
  el.style.pointerEvents = 'none';
  const obj = new CSS2DObject(el);
  // Anchor bottom-center: the element's bottom edge sits at the
  // object's world position. With the skewer's top as the anchor,
  // the text reads as sitting on top of the line.
  obj.center.set(0.5, 1);
  return obj;
}

// ---------- Component ----------

export interface DoughnutChartProps {
  slices: DoughnutSlice[];
  /** Pixel height of the chart canvas. */
  height?: number;
}

export function DoughnutChart({ slices, height = 260 }: DoughnutChartProps) {
  const colors = useThemeColors();
  const themeName = useThemeName();
  const theme = themeName === 'dark' ? DARK_DOUGHNUT_THEME : LIGHT_DOUGHNUT_THEME;

  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Parallel CSS2DRenderer for native-DOM labels. Its DOM container
  // overlays the WebGL canvas (via absolute positioning + pointer-
  // events: none) and renders each `CSS2DObject`'s element at the
  // projected screen position of its 3D world coordinates.
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const doughnutGroupRef = useRef<THREE.Group | null>(null);
  const slicesRef = useRef<SliceHandle[]>([]);
  const rotationPausedRef = useRef<boolean>(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const paletteHex = useMemo(
    () => colors.chart.map((c) => cssColorToHex(c)),
    [colors.chart],
  );

  // Mount renderer / scene / camera once. Lights and the rAF loop
  // live on the scene so they survive data refreshes — slice rebuilds
  // tear down only the doughnut group.
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

    // Overlay DOM-label renderer. Positioned absolute over the WebGL
    // canvas; pointer-events disabled so the slice raycaster on
    // `mountRef` still receives hover events through the overlay.
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.width = '100%';
    labelRenderer.domElement.style.height = '100%';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Slightly higher elevation than CostByModelPie so the doughnut's
    // hole reads clearly from above.
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.set(0, 2.6, 2.4);
    camera.lookAt(0, 0.05, 0);
    cameraRef.current = camera;

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

    // rAF loop — advances the spin and re-renders. Cheap: a single
    // transform plus a render of an already-built scene.
    //
    // Important: we increment `rotation.z`, not `rotation.y`. The
    // doughnut shape lives in its local XY plane, so its central
    // axis (the axis through the hole) is the local Z axis. With
    // default Euler order 'XYZ', vertices are transformed as
    // M*v = Rx * Ry * Rz * v — meaning Rz is applied FIRST. So the
    // spin happens in the doughnut's own plane (a flat frisbee
    // spin around its central axis), and then the standing
    // `rotation.x = -π/2` tilt drops the whole spinning shape
    // onto the floor. Net effect: the doughnut stays flat and
    // spins around the world's vertical (Y) axis.
    //
    // Using `rotation.y` here would interleave the spin BEFORE the
    // tilt around an axis IN the doughnut's plane, producing a
    // coin-tipping motion where the rim alternately lifts and dips
    // — explicitly NOT what we want.
    let rafId = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (!rotationPausedRef.current && doughnutGroupRef.current) {
        doughnutGroupRef.current.rotation.z += dt * RADIANS_PER_SECOND;
      }
      const r = rendererRef.current;
      const lr = labelRendererRef.current;
      const s = sceneRef.current;
      const c = cameraRef.current;
      if (r && s && c) r.render(s, c);
      // Render labels AFTER the WebGL pass — same scene + camera, so
      // each `CSS2DObject`'s element gets translated to the correct
      // screen position for this frame's doughnut rotation.
      if (lr && s && c) lr.render(s, c);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      if (doughnutGroupRef.current) {
        scene.remove(doughnutGroupRef.current);
        doughnutGroupRef.current.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry?.dispose();
            const mat = o.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose();
          } else if (o instanceof CSS2DObject) {
            // Detach the DOM element from the overlay container.
            o.element.remove();
          } else if (o instanceof THREE.Line) {
            o.geometry?.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        doughnutGroupRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentNode === mount) mount.removeChild(labelRenderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      labelRendererRef.current = null;
    };
  }, []);

  // Rebuild the doughnut whenever slices / size / theme change. The
  // rAF loop handles re-rendering on every frame, so this effect just
  // updates scene state.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (size.w < 2 || size.h < 2) return;

    renderer.setSize(size.w, size.h, false);
    // Keep the DOM-label renderer's coordinate space in sync with the
    // WebGL canvas. Mismatched sizes would project labels to the wrong
    // pixel positions.
    if (labelRendererRef.current) {
      labelRendererRef.current.setSize(size.w, size.h);
    }
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();

    const ambient = scene.getObjectByName('ambient') as THREE.AmbientLight | undefined;
    const key = scene.getObjectByName('key') as THREE.DirectionalLight | undefined;
    if (ambient) ambient.intensity = theme.ambient;
    if (key) key.intensity = theme.keyIntensity;

    // Tear down previous doughnut + its labels + leader lines.
    if (doughnutGroupRef.current) {
      scene.remove(doughnutGroupRef.current);
      doughnutGroupRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        } else if (o instanceof CSS2DObject) {
          // Detach the DOM element from the overlay so it doesn't
          // linger after the slice it belonged to is gone.
          o.element.remove();
        } else if (o instanceof THREE.Line) {
          o.geometry?.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      doughnutGroupRef.current = null;
      slicesRef.current = [];
    }

    if (slices.length === 0) return;

    const doughnutGroup = new THREE.Group();
    doughnutGroup.rotation.x = -Math.PI / 2; // lay flat on XZ
    const handles: SliceHandle[] = [];
    let angle = Math.PI / 2; // 12 o'clock start, clockwise sweep
    const totalPct = slices.reduce((a, s) => a + s.percentage, 0) || 100;

    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      let sweep = (s.percentage / totalPct) * Math.PI * 2;
      if (slices.length === 1) sweep = Math.PI * 2 - 0.001;
      const startAngle = angle - sweep;
      const endAngle = angle;
      const midAngle = (startAngle + endAngle) / 2;

      const shape = buildDoughnutSliceShape(startAngle, endAngle);
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: THICKNESS,
        bevelEnabled: false,
        curveSegments: CURVE_SEGMENTS,
      });
      const colorHex = paletteHex[i % paletteHex.length];
      const mat = theme.materialKind === 'basic'
        ? new THREE.MeshBasicMaterial({ color: colorHex })
        : new THREE.MeshStandardMaterial({
            color: colorHex,
            metalness: theme.sliceMetalness,
            roughness: theme.sliceRoughness,
            emissive: colorHex,
            emissiveIntensity: theme.emissiveIntensity,
          });
      // Per-slice subgroup. Hover-pop translates this group so the
      // candle (skewer + label) travels with its slice instead of
      // staying behind on the original radius.
      const sliceGroup = new THREE.Group();

      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData.sliceIdx = i;
      sliceGroup.add(mesh);

      // Vertical skewer: a thin line rising straight up from the
      // slice's top surface at its radial centroid. In local space
      // we extrude in +Z; after the doughnut group's tilt of
      // -π/2 around X, local +Z maps to world +Y, so the skewer
      // points vertically up in the rendered scene.
      const skewerX = SKEWER_BASE_RADIUS * Math.cos(midAngle);
      const skewerY = SKEWER_BASE_RADIUS * Math.sin(midAngle);
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(skewerX, skewerY, THICKNESS),
        new THREE.Vector3(skewerX, skewerY, THICKNESS + SKEWER_LENGTH),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: theme.leaderLineHex,
        transparent: true,
        opacity: 0.8,
      });
      const line = new THREE.Line(lineGeom, lineMat);
      sliceGroup.add(line);

      // CSS2DObject label at the top of the skewer. The DOM element
      // is anchored at its bottom-center (see makeLabelObject), so
      // positioning the object at the top of the skewer puts the
      // line tip at the bottom of the text. A tiny world-space gap
      // keeps the line from visually touching the descenders.
      const labelText = `${s.label}  ${s.percentage.toFixed(0)}%`;
      const label = makeLabelObject(labelText, theme.labelTextColor);
      label.position.set(
        skewerX,
        skewerY,
        THICKNESS + SKEWER_LENGTH + SKEWER_LABEL_GAP,
      );
      sliceGroup.add(label);

      doughnutGroup.add(sliceGroup);
      handles.push({ group: sliceGroup, mesh, midAngle, sliceIdx: i });

      angle -= sweep;
    }

    // Ground disk under the doughnut for shadow contrast — same
    // convention as the cost-by-model pie. Sized off OUTER_R so it
    // hugs the doughnut footprint; labels float above it on their
    // skewers and don't need ground coverage.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(OUTER_R * 1.3, 48),
      new THREE.MeshBasicMaterial({ color: theme.groundHex }),
    );
    ground.position.y = -0.001;
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    doughnutGroup.userData.ground = ground;

    scene.add(doughnutGroup);
    doughnutGroupRef.current = doughnutGroup;
    slicesRef.current = handles;

    return () => {
      scene.remove(ground);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    };
  }, [slices, size, theme, paletteHex]);

  // Hover-pop: separate effect so we don't rebuild the whole doughnut
  // on every pointer move. Also pauses the rotation so the label is
  // readable. Translates the per-slice subgroup (mesh + skewer +
  // label) so the candle moves with its slice.
  useEffect(() => {
    rotationPausedRef.current = hover !== null;
    for (const h of slicesRef.current) {
      if (hover && hover.sliceIdx === h.sliceIdx) {
        h.group.position.set(
          Math.cos(h.midAngle) * POP_OUT,
          Math.sin(h.midAngle) * POP_OUT,
          0,
        );
      } else {
        h.group.position.set(0, 0, 0);
      }
    }
    // No explicit render() call — the rAF loop handles it on the next frame.
  }, [hover]);

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
        height,
        background: theme.canvasBgCss,
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
            minWidth: 160,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <Text as="div" size="sm" family="mono" color="secondary" weight="semibold" style={{ marginBottom: 2 }}>
            {hoverInfo.label}
          </Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text as="span" size="sm" family="mono" color="secondary">count</Text>
            <Text as="span" size="sm" family="mono" tabularNums>{hoverInfo.value}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text as="span" size="sm" family="mono" color="secondary">share</Text>
            <Text as="span" size="sm" family="mono" weight="semibold" tabularNums>
              {hoverInfo.percentage.toFixed(1)}%
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}

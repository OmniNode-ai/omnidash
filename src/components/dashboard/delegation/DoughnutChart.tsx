// 3D doughnut chart for DelegationMetrics (OMN-129). Visual sibling
// of CostByModelPie — same tilted-on-XZ posture, same lighting and
// theme conventions, same hover-pop interaction. Differences:
//   - Doughnut shape: each slice is a wedge of an annulus, not a
//     full pie wedge. Inner radius is non-zero, leaving a hole.
//   - Slow continuous rotation around Y. Pauses on hover so users
//     can read the labels without chasing a moving target.
//   - Labels live in 3D as `THREE.Sprite`s positioned just outside
//     the slice's outer rim, connected to the rim midpoint by a
//     thin `THREE.Line`. Sprites always face the camera, so labels
//     stay legible while the doughnut spins.
//
// Architecture matches the CostByModelPie scaffold so future visual
// changes can be ported between the two without divergence: per-theme
// material/lighting knobs, scene-mounted lights that survive
// data refreshes, and a separate hover-pop effect that mutates mesh
// positions without rebuilding the doughnut.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Text } from '@/components/ui/typography';
import { useThemeColors, useThemeName, cssColorToHex } from '@/theme';

export interface DoughnutSlice {
  label: string;
  value: number;
  /** Pre-computed share 0..100. */
  percentage: number;
}

interface SliceHandle {
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

// Distance from center the label anchor sits at, and the position the
// leader line ends. Both are slightly outside the outer rim so the
// label and its connector clear the slice.
const LABEL_DISTANCE = 1.45;
const LEADER_LINE_INNER = OUTER_R + 0.02;
const LEADER_LINE_OUTER = LABEL_DISTANCE - 0.10;

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
  labelTextColor: '#2a3038',
  leaderLineHex: 0x6b7580,
};

// ---------- Sprite label helper ----------

/**
 * Render label text into a canvas and wrap it in a `THREE.Sprite` so
 * the label always faces the camera regardless of doughnut rotation.
 *
 * The canvas is sized to fit the text at high DPI; the sprite's world
 * scale is set so the rendered glyph is consistent in size at our
 * fixed camera distance.
 */
function makeLabelSprite(text: string, color: string): THREE.Sprite {
  // Two-pass canvas: measure, then render. Padding chosen so descenders
  // and the leader-line attachment have breathing room.
  const padX = 14;
  const padY = 8;
  const fontSize = 28;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Defensive fallback — should never happen in real browsers.
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
  }
  ctx.font = `600 ${fontSize}px IBM Plex Sans, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  canvas.width = textWidth + padX * 2;
  canvas.height = fontSize + padY * 2;
  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = `600 ${fontSize}px IBM Plex Sans, system-ui, sans-serif`;
  ctx2.fillStyle = color;
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = 'left';
  ctx2.fillText(text, padX, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false, // labels float above geometry — never occluded
  });
  const sprite = new THREE.Sprite(material);
  // Maintain 3:1 aspect-ish in world space proportional to canvas.
  const worldScaleY = 0.18;
  const worldScaleX = (canvas.width / canvas.height) * worldScaleY;
  sprite.scale.set(worldScaleX, worldScaleY, 1);
  // Render labels last so they always sit on top of slices/leader lines.
  sprite.renderOrder = 10;
  return sprite;
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

    // rAF loop — advances the doughnut's Y rotation and re-renders.
    // Cheap: a single transform plus a render of an already-built scene.
    let rafId = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (!rotationPausedRef.current && doughnutGroupRef.current) {
        doughnutGroupRef.current.rotation.y += dt * RADIANS_PER_SECOND;
      }
      const r = rendererRef.current;
      const s = sceneRef.current;
      const c = cameraRef.current;
      if (r && s && c) r.render(s, c);
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
          } else if (o instanceof THREE.Sprite) {
            o.material.map?.dispose();
            o.material.dispose();
          } else if (o instanceof THREE.Line) {
            o.geometry?.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        doughnutGroupRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
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
        } else if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
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
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData.sliceIdx = i;
      doughnutGroup.add(mesh);
      handles.push({ mesh, midAngle, sliceIdx: i });

      // Leader line: from outer-rim midpoint outward to the label
      // anchor, in the slice's local 2D plane (pre-rotation).
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          LEADER_LINE_INNER * Math.cos(midAngle),
          LEADER_LINE_INNER * Math.sin(midAngle),
          THICKNESS / 2,
        ),
        new THREE.Vector3(
          LEADER_LINE_OUTER * Math.cos(midAngle),
          LEADER_LINE_OUTER * Math.sin(midAngle),
          THICKNESS / 2,
        ),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: theme.leaderLineHex,
        transparent: true,
        opacity: 0.7,
      });
      const line = new THREE.Line(lineGeom, lineMat);
      doughnutGroup.add(line);

      // Label sprite at the outer end of the leader line. Sprites
      // always face the camera, so labels stay readable while the
      // doughnut rotates.
      const labelText = `${s.label}  ${s.percentage.toFixed(0)}%`;
      const sprite = makeLabelSprite(labelText, theme.labelTextColor);
      sprite.position.set(
        LABEL_DISTANCE * Math.cos(midAngle),
        LABEL_DISTANCE * Math.sin(midAngle),
        THICKNESS / 2,
      );
      doughnutGroup.add(sprite);

      angle -= sweep;
    }

    // Ground disk under the doughnut for shadow contrast — same convention
    // as the cost-by-model pie.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(LABEL_DISTANCE * 1.2, 48),
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
  // readable.
  useEffect(() => {
    rotationPausedRef.current = hover !== null;
    for (const h of slicesRef.current) {
      if (hover && hover.sliceIdx === h.sliceIdx) {
        h.mesh.position.set(
          Math.cos(h.midAngle) * POP_OUT,
          Math.sin(h.midAngle) * POP_OUT,
          0,
        );
      } else {
        h.mesh.position.set(0, 0, 0);
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

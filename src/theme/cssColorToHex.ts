/**
 * Parse any CSS color string into a numeric sRGB hex suitable for passing
 * to THREE.Color. Unlike THREE.Color.setStyle(), which only understands
 * rgb/hsl/hex/named colors, this helper handles modern color functions
 * like oklch() / lab() / color-mix() by letting the browser normalize
 * via a hidden 1×1 canvas whose fillStyle accepts the full CSS color
 * syntax.
 *
 * Why this exists: our dashboard theme tokens (for example the
 * `--chart-1..7` palette in globals.css) are declared as `oklch(...)`
 * values. Passing those strings straight into THREE would silently fall
 * through to a neutral-grey default on every token. This helper round-
 * trips the value through the canvas and returns an integer that
 * `new THREE.Color(hex)` accepts.
 */
export function cssColorToHex(cssValue: string | undefined, fallback = 0x888888): number {
  if (!cssValue || typeof document === 'undefined') return fallback;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    // Seed with an unusual sentinel. Canvas 2D's fillStyle setter
    // silently retains the previous value when it rejects the input,
    // so we detect rejection by comparing the normalized read-back
    // against the sentinel.
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

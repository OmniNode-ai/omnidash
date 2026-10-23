/** A model keeps its color when charts sort, filter or refresh. Presentation only. */
export function modelColor(model: string): string {
  let hash = 2166136261;
  for (const char of model.trim().toLowerCase()) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const hue = (hash % 36000) / 100;
  return `hsl(${hue} 70% var(--entity-color-lightness, 54%))`;
}

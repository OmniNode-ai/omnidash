/** Refresh the mounted local page without replacing its filters or last good rows. */
const listeners = new Set<() => void>();

export function requestLocalPageRefresh(): void {
  for (const listener of listeners) listener();
}

export function subscribeLocalPageRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Refresh the mounted local page without replacing its filters or last good rows. */
const listeners = new Set<() => void>();

export function requestLocalPageRefresh(): void {
  for (const listener of listeners) listener();
}

export function subscribeLocalPageRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// OMN-21166 AC77: Overview and Usage publish when the runtime's rows were last read, and the top bar shows it beside
// Refresh. It is the served read time, never the browser clock.
type PublishedRead = { page: 'overview' | 'usage' | null; readAt: string | null };
let published: PublishedRead = { page: null, readAt: null };
const readListeners = new Set<() => void>();

export function publishLocalPageRead(page: PublishedRead['page'], readAt: string | null): void {
  if (published.page === page && published.readAt === readAt) return;
  published = { page, readAt };
  for (const listener of readListeners) listener();
}

export function subscribeLocalPageRead(listener: () => void): () => void {
  readListeners.add(listener);
  return () => { readListeners.delete(listener); };
}

export function currentLocalPageRead(): PublishedRead {
  return published;
}

/** The newest served read among a page's snapshots; a failed read counts only through its last good read. */
export function latestServedRead(snapshots: ReadonlyArray<{ readAt: string; failure?: unknown; lastGoodAt?: string | null }>): string | null {
  let latest: string | null = null;
  for (const snapshot of snapshots) {
    const at = snapshot.failure ? snapshot.lastGoodAt ?? null : snapshot.readAt;
    if (at !== null && Number.isFinite(Date.parse(at)) && (latest === null || Date.parse(at) > Date.parse(latest))) latest = at;
  }
  return latest;
}

/** "Updated 10:04 UTC", with the date when the read was on another UTC day than now. */
export function updatedLabel(readAt: string, now: number): string {
  const at = new Date(readAt);
  const time = at.toISOString().slice(11, 16);
  if (at.toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10)) return `Updated ${time} UTC`;
  return `Updated ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${time} UTC`;
}

// T21 / M10: shared mockFetchWithItems helper.
//
// FileSnapshotSource pattern: index.json returns the list of file names,
// each numbered file returns one item. This helper sets up a vi-stubbed
// fetch that responds in that pattern given a list of items.
//
// Caller responsibility: stub global fetch with vi.stubGlobal('fetch',
// vi.fn()) BEFORE calling this helper.

export function mockFetchWithItems(items: unknown[]): void {
  const fileNames = items.map((_, i) => `${i}.json`);
  const fileMap = new Map(fileNames.map((name, i) => [name, items[i]]));
  (globalThis.fetch as unknown as { mockResolvedValueOnce: (v: unknown) => { mockImplementation: (fn: (url: string) => Promise<unknown>) => void } })
    .mockResolvedValueOnce({ ok: true, json: async () => fileNames })
    .mockImplementation((url: string) => {
      const filename = url.split('/').pop() ?? '';
      const item = fileMap.get(filename) ?? null;
      return Promise.resolve({ ok: true, json: async () => item });
    });
}

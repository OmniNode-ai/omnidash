import type { Decorator } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnapshotSourceProvider } from '@/data-source';
import { ThemeProvider } from '@/theme';

/**
 * Options for {@link makeDashboardDecorator}. Each call site picks ONE of:
 *
 * - `prefetched` — seed the QueryClient cache with fixture data so the
 *   widget reads it through `useProjectionQuery` exactly the way it
 *   would at runtime. Use for `Populated` stories.
 * - `forceLoading` — disable queries entirely so widgets stay in
 *   pending state. Use for `Loading` stories.
 * - `forceError` — install a default `queryFn` that throws so widgets
 *   surface their error state. Use for `Error` stories.
 *
 * The three options are mutually exclusive in practice; the decorator
 * applies them in priority order (forceError > forceLoading > prefetched).
 */
export interface DashboardContextOptions {
  /** Pre-seeded query cache: keys → data. Use to inject fixture data for stories. */
  prefetched?: Array<{ queryKey: unknown[]; data: unknown }>;
  /** Force loading state by leaving the cache empty + disabling queries. Default false. */
  forceLoading?: boolean;
  /** Force error state by setting all queries to throw. Default false. */
  forceError?: boolean;
}

/**
 * Build a Storybook decorator that wraps a story in a fresh
 * `QueryClient`, the app's `ThemeProvider`, and a 16px-padded container.
 *
 * A new `QueryClient` is instantiated per decorator invocation (i.e.
 * per story render) so cache pre-seeding for one story never leaks
 * into the next.
 *
 * Usage in a per-story `decorators` array:
 *
 *   decorators: [makeDashboardDecorator({
 *     prefetched: [{ queryKey: ['routing-decisions'], data: rows }],
 *   })]
 *
 * The decorator is applied **explicitly per-story**, not globally in
 * `.storybook/preview.tsx`, because Storybook's decorator stack
 * composes (does not replace) — wiring a default decorator globally
 * would double the QueryClient + ThemeProvider context for every
 * widget story that supplies its own. See ADR
 * `docs/adr/002-storybook-widget-coverage.md` for context.
 */
export function makeDashboardDecorator(opts: DashboardContextOptions = {}): Decorator {
  return (Story, context) => {
    // Read the active Storybook theme (set by `withThemeByDataAttribute`
    // in `.storybook/preview.tsx`) and pass it into our `ThemeProvider`
    // as the initial state. Without this, `ThemeProvider` defaults to
    // 'dark' on every story mount, runs its useEffect which writes
    // `data-theme="dark"` onto <html>, and then the addon's effect
    // overwrites it back to 'light' — producing a visible dark→light
    // flash on every story click while in light mode.
    const themeKey = (context.globals?.theme as string | undefined) ?? 'Light';
    const initialTheme = themeKey.toLowerCase() === 'dark' ? 'dark' : 'light';

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Force loading by disabling queries — they stay in `pending`
          // status forever, which is what `useQuery` returns while
          // initially fetching.
          enabled: !opts.forceLoading,
          // For stories with prefetched data: prevent React Query from
          // refetching in the background. Default `staleTime: 0` would
          // mark the seeded cache as stale on mount, fire the widget's
          // queryFn (which calls createSnapshotSource() → fails in the
          // Storybook iframe because no Vite middleware serves
          // /_layouts/... or /_fixtures/... there), and surface an
          // `error` to the widget. ComponentWrapper renders error state
          // OVER the cached `data`, so every Populated story would show
          // the same error message regardless of which fixture was
          // seeded. Infinity locks the cache as fresh — exactly what
          // we want for static-fixture demos.
          staleTime: opts.prefetched ? Infinity : 0,
        },
      },
    });

    if (opts.forceError) {
      // Default queryFn throws; widgets that call useQuery without a
      // queryFn (i.e. those reading from the seeded cache) will
      // surface the thrown error through `error` from useQuery.
      queryClient.setDefaultOptions({
        queries: {
          retry: false,
          queryFn: () => {
            throw new Error('Forced error state for Storybook');
          },
        },
      });
    } else if (!opts.forceLoading && opts.prefetched) {
      for (const { queryKey, data } of opts.prefetched) {
        queryClient.setQueryData(queryKey, data);
      }
    }

    return (
      <QueryClientProvider client={queryClient}>
        <SnapshotSourceProvider>
          <ThemeProvider defaultTheme={initialTheme}>
            <div style={{ padding: 16, minWidth: 320 }}>
              <Story />
            </div>
          </ThemeProvider>
        </SnapshotSourceProvider>
      </QueryClientProvider>
    );
  };
}

import type { Decorator } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  return (Story) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Force loading by disabling queries — they stay in `pending`
          // status forever, which is what `useQuery` returns while
          // initially fetching.
          enabled: !opts.forceLoading,
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
        <ThemeProvider>
          <div style={{ padding: 16, minWidth: 320 }}>
            <Story />
          </div>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}

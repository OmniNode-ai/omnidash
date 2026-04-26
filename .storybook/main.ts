import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    // Trimmed addon list for cold-start performance. Re-add anything
    // below when actually used.
    //   '@chromatic-com/storybook'    — visual regression service. Not used.
    //   '@storybook/addon-vitest'     — Storybook test runner integration. We
    //                                   use vitest directly; the addon's
    //                                   manager-side UniversalStore bootstrap
    //                                   throws on every Storybook boot
    //                                   without a "leader" test runner.
    //   '@storybook/addon-onboarding' — welcome tour for new Storybook users.
    //   '@storybook/addon-docs'       — MDX docs framework. We use plain TSX
    //                                   stories; not authoring MDX.
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  // Switched from `react-docgen-typescript` (uses full TS program — accurate
  // but very slow on cold start, the single biggest contributor to startup
  // time when stories include heavy widgets like CostTrend3D / CostByModelPie)
  // to `react-docgen` (regex/AST-based, ~10× faster). Prop tables in the
  // Controls panel will be slightly less detailed but still functional.
  // To regain the richer prop typing later, reverse this flag.
  typescript: { reactDocgen: 'react-docgen' },
  // Dedupe react / react-dom so libraries that bring their own peer-dep
  // resolution (echarts-for-react, @tanstack/react-query, three drei, etc.)
  // share the host iframe's React instance. Without this, hook calls inside
  // those libraries hit "resolveDispatcher() is null / cannot read property
  // useMemo" because Vite's dependency optimizer materialized two React
  // copies. Also pre-bundle the chart libraries + react-query explicitly so
  // Vite resolves their React references against the deduped copy at
  // optimize time, which dramatically improves cold-load performance.
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.dedupe = Array.from(
      new Set([...(config.resolve.dedupe ?? []), 'react', 'react-dom']),
    );
    config.optimizeDeps = config.optimizeDeps ?? {};
    config.optimizeDeps.include = Array.from(
      new Set([
        ...(config.optimizeDeps.include ?? []),
        'echarts-for-react',
        'echarts',
        '@tanstack/react-query',
        'three',
      ]),
    );
    return config;
  },
};
export default config;

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from './index';
import type { TextColor, TextSize, TextWeight, TextLeading } from './tokens';

const meta: Meta = { title: 'UI/Typography' };
export default meta;

const SIZES: readonly TextSize[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] as const;
const SIZE_PX: Record<TextSize, string> = {
  xs: '10px',
  sm: '11px',
  md: '12px',
  lg: '13px',
  xl: '14px',
  '2xl': '16px',
  '3xl': '18px',
  '4xl': '22px',
};
const COLORS: readonly TextColor[] = [
  'primary', 'secondary', 'tertiary', 'brand', 'ok', 'warn', 'bad', 'inherit',
] as const;
const WEIGHTS: readonly TextWeight[] = ['regular', 'medium', 'semibold', 'bold'] as const;
const LEADINGS: readonly TextLeading[] = ['tight', 'normal', 'loose'] as const;
const LOREM =
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. Bright vixens jump; dozy fowl quack.';

export const ScaleShowcase: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {SIZES.map((s) => (
        <div key={s} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 12 }}>
          <Text size="sm" family="mono" color="tertiary">
            --text-{s} ({SIZE_PX[s]})
          </Text>
          <Text size={s}>The quick brown fox jumps over the lazy dog.</Text>
        </div>
      ))}
    </div>
  ),
};

export const ColorRoles: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {COLORS.map((c) => (
        <div
          key={c}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '6px 10px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            width: 'fit-content',
          }}
        >
          <Text size="sm" family="mono" color="tertiary" style={{ minWidth: 90 }}>
            color=&quot;{c}&quot;
          </Text>
          <Text color={c}>Sample text in the {c} role.</Text>
        </div>
      ))}
    </div>
  ),
};

export const Weights: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 10 }}>
      {WEIGHTS.map((w) => (
        <div key={w} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 12 }}>
          <Text size="sm" family="mono" color="tertiary">
            weight=&quot;{w}&quot;
          </Text>
          <Text size="xl" weight={w}>
            The quick brown fox jumps over the lazy dog.
          </Text>
        </div>
      ))}
    </div>
  ),
};

export const Leadings: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      {LEADINGS.map((l) => (
        <div key={l}>
          <Text size="sm" family="mono" color="tertiary">
            leading=&quot;{l}&quot;
          </Text>
          <Text as="p" leading={l} style={{ margin: '4px 0 0' }}>
            {LOREM}
          </Text>
        </div>
      ))}
    </div>
  ),
};

export const Families: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 12 }}>
        <Text size="sm" family="mono" color="tertiary">
          family=&quot;sans&quot;
        </Text>
        <Text size="lg" family="sans">
          The quick brown fox jumps over the lazy dog.
        </Text>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'baseline', gap: 12 }}>
        <Text size="sm" family="mono" color="tertiary">
          family=&quot;mono&quot;
        </Text>
        <Text size="lg" family="mono">
          The quick brown fox jumps over the lazy dog.
        </Text>
      </div>
    </div>
  ),
};

export const TabularNums: StoryObj = {
  render: () => {
    const rows = ['1.234', '12.34', '123.4', '1234.5', '12345'];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 480 }}>
        <div>
          <Text size="sm" family="mono" color="tertiary">
            default (proportional)
          </Text>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {rows.map((r) => (
              <Text key={r} family="mono">
                {r}
              </Text>
            ))}
          </div>
        </div>
        <div>
          <Text size="sm" family="mono" color="tertiary">
            tabularNums
          </Text>
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {rows.map((r) => (
              <Text key={r} family="mono" tabularNums>
                {r}
              </Text>
            ))}
          </div>
        </div>
      </div>
    );
  },
};

export const Truncate: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      <Text size="sm" family="mono" color="tertiary">
        width: 200px, truncate
      </Text>
      <div style={{ width: 200, border: '1px solid var(--line)', padding: 8, borderRadius: 6 }}>
        <Text truncate>
          A very long string that will definitely overflow the container width and get ellipsized.
        </Text>
      </div>
    </div>
  ),
};

export const KitchenSink_DataRow: StoryObj = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr auto',
        alignItems: 'center',
        gap: 16,
        padding: '8px 12px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        maxWidth: 640,
      }}
    >
      <Text size="md" family="mono" color="tertiary" tabularNums>
        2026-04-24 14:37:22
      </Text>
      <Text size="md" family="mono">
        onex.evt.router.decision.v1
      </Text>
      <span
        style={{
          display: 'inline-flex',
          padding: '2px 8px',
          border: '1px solid var(--line)',
          borderRadius: 999,
          background: 'var(--panel-2)',
        }}
      >
        <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">
          ROUTER
        </Text>
      </span>
    </div>
  ),
};

export const KitchenSink_ColumnHeader: StoryObj = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr auto',
        gap: 16,
        padding: '8px 12px',
        borderBottom: '1px solid var(--line)',
        maxWidth: 640,
      }}
    >
      <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">
        TIME
      </Text>
      <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">
        EVENT
      </Text>
      <Text size="xs" weight="semibold" transform="uppercase" color="secondary" className="text-tracked">
        SOURCE
      </Text>
    </div>
  ),
};

export const ThemeContrast: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div data-theme="light" style={{ background: 'var(--panel)', padding: 12, borderRadius: 6, border: '1px solid var(--line)' }}>
        <Text size="sm" family="mono" color="tertiary" style={{ display: 'block', marginBottom: 8 }}>
          data-theme=&quot;light&quot;
        </Text>
        <div style={{ display: 'grid', gap: 4 }}>
          {COLORS.map((c) => (
            <Text key={c} color={c}>
              color=&quot;{c}&quot; — sample text
            </Text>
          ))}
        </div>
      </div>
      <div data-theme="dark" style={{ background: 'var(--panel)', padding: 12, borderRadius: 6, border: '1px solid var(--line)' }}>
        <Text size="sm" family="mono" color="tertiary" style={{ display: 'block', marginBottom: 8 }}>
          data-theme=&quot;dark&quot;
        </Text>
        <div style={{ display: 'grid', gap: 4 }}>
          {COLORS.map((c) => (
            <Text key={c} color={c}>
              color=&quot;{c}&quot; — sample text
            </Text>
          ))}
        </div>
      </div>
    </div>
  ),
};

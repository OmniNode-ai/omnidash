// Storybook coverage for ComponentWrapper — the chrome that every
// widget renders inside. Unlike data-driven widgets, this component
// does not call `useProjectionQuery`, so `makeDashboardDecorator` is
// not needed: stories drive the four chrome states (loading, error,
// empty, populated) directly via props. The default
// `WidgetChromeContext` value is `{}`, so when these stories render
// outside a `ComponentCell` the kebab menu and drag grip are simply
// absent — exactly the prop surface this story exercises.
//
// `Empty` (no underscore suffix) is the canonical default-message
// render and exists so the OMN-100 storybook coverage compliance grep
// (`/export\s+const\s+Empty\s*[:=]/` — see
// `src/storybook-coverage-compliance.test.ts`) passes. The companion
// `Empty_CustomMessage` exercises the `emptyMessage` + `emptyHint`
// override path. `Populated` is the compliance anchor for the data-
// rendered branch and feeds children through a `<Text>` block to
// stay inside the typography system.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentWrapper } from './ComponentWrapper';
import { Text } from '@/components/ui/typography';

const meta: Meta<typeof ComponentWrapper> = {
  title: 'Dashboard / ComponentWrapper',
  component: ComponentWrapper,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ minWidth: 360, minHeight: 200 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ComponentWrapper>;

// ----- Loading --------------------------------------------------------
//
// `isLoading` short-circuits the body and renders the "Loading..."
// placeholder. `children` is required by the prop type but is gated
// behind `!isLoading && !error && !isEmpty` in the component, so the
// content here never renders — passing `null` keeps the prop type
// happy without leaking placeholder DOM.

export const Loading: Story = {
  args: { title: 'Sample Widget', isLoading: true, children: null },
};

// ----- Error ----------------------------------------------------------
//
// Surfaces an `Error` instance — `ComponentWrapper` reads `.message`
// off it and renders "Error: <message>" in the bad-state colour.

export const Error_WithMessage: Story = {
  args: {
    title: 'Sample Widget',
    error: new Error('Failed to fetch projection data'),
    children: null,
  },
};

// ----- Empty (default message) ---------------------------------------
//
// Compliance anchor — named `Empty` (no underscore) so the OMN-100
// scorecard's `/export\s+const\s+Empty\s*[:=]/` grep passes. This is
// the "no `emptyMessage` prop supplied" branch where
// `ComponentWrapper` falls back to "No data available".

export const Empty: Story = {
  args: { title: 'Sample Widget', isEmpty: true, children: null },
};

// ----- Empty (custom message + hint) ---------------------------------
//
// Exercises the `emptyMessage` override plus the optional `emptyHint`
// secondary line — the hint is rendered as a smaller, tertiary-tinted
// `<Text>` beneath the primary message.

export const Empty_CustomMessage: Story = {
  args: {
    title: 'Sample Widget',
    isEmpty: true,
    emptyMessage: 'No data this period',
    emptyHint: 'Try expanding the date range',
    children: null,
  },
};

// ----- Populated ------------------------------------------------------
//
// Compliance anchor for the data-rendered branch. Passes a `<Text>`
// block as children so the rendered DOM stays inside the typography
// system (per `local/no-typography-inline`).

export const Populated: Story = {
  args: {
    title: 'Sample Widget',
    children: (
      <Text>
        This is the widget body content. Lorem ipsum dolor sit amet,
        consectetur adipiscing elit.
      </Text>
    ),
  },
};

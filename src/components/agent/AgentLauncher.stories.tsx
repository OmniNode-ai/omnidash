// Storybook coverage for AgentLauncher (OMN-119) — the floating
// "AI" button that opens the chat panel.
//
// Important: the launcher's current styling does NOT match the
// Claude Design prototype's intended orb — its background uses
// `hsl(var(--primary))`, but `--primary` resolves to an `oklch(...)`
// expression in this project, so `hsl(oklch(...))` is invalid CSS
// and the orb renders without its intended fill. That mismatch is
// the explicit motivation for OMN-119: bring the orb into Storybook
// so the gap is visible at a glance and a follow-up redesign ticket
// has a workbench. The styling is preserved verbatim here so the
// "broken" state is documented rather than papered over.
//
// `position: fixed` puts the launcher at viewport-relative
// bottom-right, which in a normal-layout story would float over the
// docs page. We render inside a `position: relative` 320×120 frame
// to anchor `position: fixed` at the frame instead.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AgentLauncher } from './AgentLauncher';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof AgentLauncher> = {
  title: 'Agent / AgentLauncher',
  component: AgentLauncher,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div
        style={{
          position: 'relative',
          width: 320,
          height: 120,
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          borderRadius: 8,
        }}
      >
        <Story />
      </div>
    ),
    makeDashboardDecorator({}),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentLauncher>;

// ----- Idle (Empty alias) -------------------------------------------
//
// Default render — chat panel closed, button waiting for a click.
// Compliance anchor.
export const Idle: Story = {
  args: {
    isOpen: false,
    onClick: fn(),
  },
};
export const Empty = Idle;

// ----- Active (Populated alias) -------------------------------------
//
// Chat panel is open. `aria-pressed` is true. Today the visual is
// identical to Idle because the prototype's distinct active-state
// styling has not yet been ported (see follow-up redesign ticket).
// Compliance anchor.
export const Active: Story = {
  args: {
    isOpen: true,
    onClick: fn(),
  },
};
export const Populated = Active;

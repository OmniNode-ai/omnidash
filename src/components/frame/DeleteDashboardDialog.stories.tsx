// Storybook coverage for DeleteDashboardDialog (OMN-127). The
// dialog is fully presentational: the parent owns "is anything
// pending deletion" via `dashboardName`, and the buttons just call
// `onConfirm` / `onCancel`. Stories therefore drive every branch
// directly through props with mocked handlers.
//
// Three states cover the meaningful renders:
//   - `Closed` (Empty alias): `dashboardName` is null → component
//     returns null, canvas is blank. Documents the closed state for
//     completeness.
//   - `Open` (Populated alias): canonical "user just clicked Delete
//     in the kebab" view. The destructive `btn danger` confirm sits
//     beside Cancel.
//   - `LongName`: dashboard name is unusually long — verifies the
//     copy still flows naturally inside `.modal-body`.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DeleteDashboardDialog } from './DeleteDashboardDialog';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof DeleteDashboardDialog> = {
  title: 'Frame / DeleteDashboardDialog',
  component: DeleteDashboardDialog,
  parameters: { layout: 'fullscreen' },
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj<typeof DeleteDashboardDialog>;

// ----- Closed (Empty alias) -----------------------------------------
//
// `dashboardName` null → component returns null. The canvas is
// intentionally blank; this story exists to document the closed
// state and to satisfy the OMN-100 compliance scorecard.
export const Closed: Story = {
  args: {
    dashboardName: null,
    onConfirm: fn(),
    onCancel: fn(),
  },
};
export const Empty = Closed;

// ----- Open (Populated alias) ---------------------------------------
//
// Canonical "user just clicked Delete in the kebab" render. Confirm
// button has `btn danger` styling for visual distinction.
export const Open: Story = {
  args: {
    dashboardName: 'Cost Analytics',
    onConfirm: fn(),
    onCancel: fn(),
  },
};
export const Populated = Open;

// ----- LongName ------------------------------------------------------
//
// Stress-test the body copy with a long dashboard name. The
// `<strong>` wraps within the paragraph; the modal width stays
// fixed so reviewers can confirm copy flow.
export const LongName: Story = {
  args: {
    dashboardName:
      'Q3 2026 Platform Engineering Cost Analytics & Routing Decisions Overview',
    onConfirm: fn(),
    onCancel: fn(),
  },
};

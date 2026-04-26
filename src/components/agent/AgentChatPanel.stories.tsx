// Storybook coverage for AgentChatPanel (OMN-119) — the slide-in
// chat panel launched from `AgentLauncher`. The panel is fully
// presentational over its props (`isOpen`, `isAgentReady`,
// `isThinking`, `messages`), so stories drive each branch directly
// with mock handlers from `storybook/test`.
//
// Stories cover the meaningful states:
//   - `Closed` (Empty alias): `isOpen` false → component returns
//     null. Documents the closed state.
//   - `Connecting`: panel open but agent not yet ready → renders
//     "Connecting to AI model..." placeholder.
//   - `EmptyConversation`: panel open, agent ready, no messages →
//     suggested prompts render in the message list.
//   - `Populated`: panel open, agent ready, several user/assistant
//     messages — the canonical "in-conversation" view.
//   - `Thinking`: panel open with messages and `isThinking=true` —
//     "Thinking..." indicator appears at the bottom of the list.
//
// AgentChatPanel reads its message types from
// `@/store/conversationSlice.ConversationMessage`, so fixtures are
// constructed against that interface and the stories break loudly
// if the message shape changes.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AgentChatPanel } from './AgentChatPanel';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import type { ConversationMessage } from '@/store/conversationSlice';

const FIXED_TS = 1745539200000; // 2026-04-25T00:00:00Z

const FIXTURE_MESSAGES: ConversationMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Add a Cost Trend widget for the last 7 days.',
    timestamp: FIXED_TS,
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content:
      "Done — I added a Cost Trend panel and set its time range to the last 7 days. It's at the top-left of your grid.",
    timestamp: FIXED_TS + 2_000,
    actions: [
      { name: 'addComponentToLayout', args: { componentName: 'cost-trend-panel' }, result: 'success' },
      { name: 'setTimeRange', args: { range: '7d' }, result: 'success' },
    ],
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Now show me cost broken down by model.',
    timestamp: FIXED_TS + 5_000,
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: 'Added a Cost by Model pie below the trend.',
    timestamp: FIXED_TS + 7_000,
    actions: [
      { name: 'addComponentToLayout', args: { componentName: 'cost-by-model' }, result: 'success' },
    ],
  },
];

const meta: Meta<typeof AgentChatPanel> = {
  title: 'Agent / AgentChatPanel',
  component: AgentChatPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj<typeof AgentChatPanel>;

// ----- Closed (Empty alias) -----------------------------------------
//
// `isOpen` false → component returns null. Compliance anchor.
export const Closed: Story = {
  args: {
    isOpen: false,
    onToggle: fn(),
    onSend: async () => '',
    isAgentReady: true,
  },
};
export const Empty = Closed;

// ----- Connecting ---------------------------------------------------
//
// Panel open, agent not yet ready. Displays the "Connecting to AI
// model..." placeholder instead of the message list.
export const Connecting: Story = {
  args: {
    isOpen: true,
    onToggle: fn(),
    onSend: async () => '',
    isAgentReady: false,
  },
};

// ----- EmptyConversation --------------------------------------------
//
// Panel open, agent ready, no messages — suggested prompts render
// inside the message list area.
export const EmptyConversation: Story = {
  args: {
    isOpen: true,
    onToggle: fn(),
    onSend: async () => '',
    isAgentReady: true,
    messages: [],
  },
};

// ----- Populated ----------------------------------------------------
//
// Panel open, agent ready, multi-turn conversation. Compliance
// anchor for the "real-world" render.
export const Populated: Story = {
  args: {
    isOpen: true,
    onToggle: fn(),
    onSend: async () => '',
    isAgentReady: true,
    messages: FIXTURE_MESSAGES,
  },
};

// ----- Thinking -----------------------------------------------------
//
// Same conversation as Populated, but with `isThinking=true` so the
// "Thinking..." indicator renders below the last message. The
// composer's input is disabled and the Send button is disabled.
export const Thinking: Story = {
  args: {
    isOpen: true,
    onToggle: fn(),
    onSend: async () => '',
    isAgentReady: true,
    isThinking: true,
    messages: FIXTURE_MESSAGES,
  },
};

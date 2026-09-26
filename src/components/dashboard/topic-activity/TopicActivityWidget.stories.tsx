import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectionSnapshot } from '@/data-source';
import { TopicActivityView, type TopicActivityRow } from './TopicActivityWidget';

const snapshot = (rows: TopicActivityRow[]): ProjectionSnapshot<TopicActivityRow> => ({
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: rows[0]?.newest_message_at ?? null,
  readAt: '2026-09-26T12:00:00Z',
});
const row: TopicActivityRow = {
  topic: 'onex.evt.omniclaude.tool-executed.v1', sampled_at: '2026-09-26T12:00:00Z', high_watermark_total: 18740, low_watermark_total: 12000, retained_messages: 6740, messages_since_previous_sample: 48, rate_per_second: 1.6, messages_last_hour: 2310, messages_last_24h: 14220, rate_last_hour_per_second: 0.6417, retention_truncated: false, newest_message_at: '2026-09-26T11:59:57Z', newest_message_age_seconds_at_sample: 3, activity_state: 'ACTIVE', projection_cursor: '18740',
};

const meta: Meta<typeof TopicActivityView> = { title: 'Dashboard / TopicActivity', component: TopicActivityView, parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj<typeof TopicActivityView>;

export const Empty: Story = { args: { snapshot: snapshot([]), available: false } };
export const Populated: Story = { args: { snapshot: snapshot([row]), available: true } };

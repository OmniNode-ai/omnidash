import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { TopicActivityView, type TopicActivityRow } from './TopicActivityWidget';

function row(topic: string, rate: number): TopicActivityRow {
  return { topic, sampled_at: '2026-09-26T12:00:00Z', high_watermark_total: 100, low_watermark_total: 0, retained_messages: 100, messages_since_previous_sample: 10, rate_per_second: rate, messages_last_hour: rate * 100, messages_last_24h: rate * 1000, rate_last_hour_per_second: rate, retention_truncated: false, newest_message_at: '2026-09-26T11:59:30Z', newest_message_age_seconds_at_sample: 30, activity_state: rate > 0 ? 'ACTIVE' : 'QUIET', projection_cursor: topic };
}
function snapshot(rows: TopicActivityRow[]): ProjectionSnapshot<TopicActivityRow> {
  return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: '2026-09-26T11:59:30Z', readAt: '2026-09-26T12:00:00Z' };
}

describe('TopicActivityView', () => {
  it('renders the OMN-19716 typed empty state when census says unavailable', () => {
    render(<TopicActivityView snapshot={snapshot([])} available={false} />);
    expect(screen.getByText(/OMN-19716 topic-activity projection not yet bus-backed/i)).toBeInTheDocument();
    expect(screen.getByText('Topic activity producer missing').closest('[data-empty-state-reason]')).toHaveAttribute('data-empty-state-reason', 'upstream-blocked');
  });

  it('defaults to most active first and suffix-filters topics', () => {
    render(<TopicActivityView snapshot={snapshot([row('env.topic.quiet.v1', 0), row('env.topic.active.v1', 2)])} available />);
    expect(screen.getAllByTestId('topic-activity-row')[0]).toHaveTextContent('active.v1');
    fireEvent.change(screen.getByLabelText('Filter topic activity by suffix'), { target: { value: 'quiet.v1' } });
    expect(screen.getAllByTestId('topic-activity-row')).toHaveLength(1);
    expect(screen.getByTestId('topic-activity-row')).toHaveTextContent('quiet.v1');
    expect(screen.getByText('30s')).toBeInTheDocument();
  });
});

import { useState, useMemo } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Text, Heading } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

interface VoiceSession {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  total_turns: number;
  total_duration_ms: number;
  agent_name: string;
  transcript_turns: TranscriptTurn[];
}

interface TranscriptTurn {
  turn_id: string;
  speaker: 'user' | 'agent';
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number | null;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function AudioTimeline({
  turns,
  totalDuration,
  activeTurnId,
  onSelect,
}: {
  turns: TranscriptTurn[];
  totalDuration: number;
  activeTurnId: string | null;
  onSelect: (id: string) => void;
}) {
  if (totalDuration === 0) return null;
  return (
    <div
      style={{
        position: 'relative',
        height: 48,
        background: 'var(--surface-2, oklch(18% 0.01 260))',
        borderRadius: 6,
        overflow: 'hidden',
      }}
      aria-label="Audio timeline"
    >
      {turns.map((turn) => {
        const left = (turn.start_ms / totalDuration) * 100;
        const width = Math.max(0.5, ((turn.end_ms - turn.start_ms) / totalDuration) * 100);
        const isAgent = turn.speaker === 'agent';
        const isActive = turn.turn_id === activeTurnId;
        return (
          <button
            key={turn.turn_id}
            onClick={() => onSelect(turn.turn_id)}
            title={`${turn.speaker}: ${turn.text.slice(0, 80)}`}
            aria-label={`${turn.speaker} turn at ${formatDuration(turn.start_ms)}`}
            style={{
              all: 'unset',
              position: 'absolute',
              top: isAgent ? 4 : 26,
              height: 16,
              left: `${left}%`,
              width: `${width}%`,
              minWidth: 3,
              borderRadius: 3,
              background: isActive
                ? 'var(--brand, oklch(55% 0.2 260))'
                : isAgent
                  ? 'var(--status-ok)'
                  : 'var(--status-warn)',
              opacity: isActive ? 1 : 0.7,
              cursor: 'pointer',
              transition: 'opacity 0.1s',
            }}
          />
        );
      })}
    </div>
  );
}

function TranscriptPanel({ turns, activeTurnId }: { turns: TranscriptTurn[]; activeTurnId: string | null }) {
  if (turns.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text size="sm" color="tertiary">No transcript available</Text>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px' }}>
      {turns.map((turn) => {
        const isAgent = turn.speaker === 'agent';
        const isActive = turn.turn_id === activeTurnId;
        return (
          <div
            key={turn.turn_id}
            data-testid="transcript-turn"
            style={{
              display: 'flex',
              flexDirection: isAgent ? 'row-reverse' : 'row',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isAgent ? 'color-mix(in oklch, var(--status-ok) 20%, transparent)' : 'color-mix(in oklch, var(--status-warn) 20%, transparent)',
                flexShrink: 0,
              }}
            >
              {isAgent
                ? <Mic size={12} style={{ color: 'var(--status-ok)' }} />
                : <MicOff size={12} style={{ color: 'var(--status-warn)' }} />
              }
            </div>
            <div
              style={{
                maxWidth: '70%',
                padding: '8px 12px',
                borderRadius: 8,
                background: isActive
                  ? 'color-mix(in oklch, var(--brand, oklch(55% 0.2 260)) 12%, var(--surface-2, oklch(18% 0.01 260)))'
                  : 'var(--surface-2, oklch(18% 0.01 260))',
                border: isActive ? '1px solid var(--brand, oklch(55% 0.2 260))' : '1px solid var(--border, oklch(20% 0.01 260))',
              }}
            >
              <Text size="xs" color="tertiary" family="mono" style={{ marginBottom: 4, display: 'block' }}>
                {turn.speaker} · {formatDuration(turn.start_ms)}
                {turn.confidence !== null && ` · ${(turn.confidence * 100).toFixed(0)}% conf`}
              </Text>
              <Text size="sm" color="primary">{turn.text}</Text>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VoiceSessionPage() {
  const dataSourceMode = useDataSourceMode();
  const { data: sessions, isLoading, error } = useProjectionQuery<VoiceSession>({
    topic: TOPICS.voiceSessions,
    queryKey: ['voice-sessions'],
    refetchInterval: 10_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sessions) return [];
    return [...sessions].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
  }, [sessions]);

  const selected = sorted.find((s) => s.session_id === selectedId) ?? null;
  const activeCount = sorted.filter((s) => s.is_active).length;

  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Voice Sessions</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text size="sm" color="secondary">
              {isLoading ? 'Loading…' : error ? 'Server unavailable' : isLiveDataSource(dataSourceMode) ? 'LIVE' : 'Fixture data'}
            </Text>
          </div>
        </div>
        <div className="header-actions" style={{ gap: 12 }}>
          {activeCount > 0 && (
            <Text size="sm" color="ok">{activeCount} active</Text>
          )}
          <Text size="sm" color="tertiary">{sorted.length} sessions</Text>
        </div>
      </div>

      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        {isLoading && <Text size="sm" color="tertiary">Loading voice sessions…</Text>}

        {!isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            {/* Session list */}
            <div
              style={{
                background: 'var(--surface, oklch(14% 0.01 260))',
                border: '1px solid var(--border, oklch(20% 0.01 260))',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
                <Text size="xs" weight="semibold" color="tertiary" transform="uppercase">Sessions</Text>
              </div>
              {sorted.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <Text size="sm" color="tertiary">
                    {error ? 'Server unavailable — no data' : 'No voice sessions recorded'}
                  </Text>
                </div>
              )}
              {sorted.map((sess) => (
                <button
                  key={sess.session_id}
                  onClick={() => { setSelectedId(sess.session_id); setActiveTurnId(null); }}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    width: '100%',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border, oklch(20% 0.01 260))',
                    borderLeft: `3px solid ${sess.session_id === selectedId ? 'var(--brand, oklch(55% 0.2 260))' : sess.is_active ? 'var(--status-ok)' : 'transparent'}`,
                    background: sess.session_id === selectedId ? 'color-mix(in oklch, var(--brand, oklch(55% 0.2 260)) 8%, transparent)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text size="xs" family="mono" color="primary" truncate>{sess.session_id.slice(0, 14)}</Text>
                    {sess.is_active && (
                      <Text size="xs" color="ok">● LIVE</Text>
                    )}
                  </div>
                  <Text size="xs" color="tertiary">{sess.agent_name}</Text>
                  <Text size="xs" color="tertiary" family="mono">
                    {formatTimestamp(sess.started_at)} · {sess.total_turns} turns · {formatDuration(sess.total_duration_ms)}
                  </Text>
                </button>
              ))}
            </div>

            {/* Session detail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!selected ? (
                <div
                  style={{
                    background: 'var(--surface, oklch(14% 0.01 260))',
                    border: '1px solid var(--border, oklch(20% 0.01 260))',
                    borderRadius: 8,
                    padding: 40,
                    textAlign: 'center',
                  }}
                >
                  <Text color="tertiary" size="sm">Select a session to view transcript</Text>
                </div>
              ) : (
                <>
                  {/* Session metadata */}
                  <div
                    style={{
                      background: 'var(--surface, oklch(14% 0.01 260))',
                      border: '1px solid var(--border, oklch(20% 0.01 260))',
                      borderRadius: 8,
                      padding: '14px 18px',
                      display: 'flex',
                      gap: 24,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Agent</Text>
                      <Text size="sm" family="mono">{selected.agent_name}</Text>
                    </div>
                    <div>
                      <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Duration</Text>
                      <Text size="sm" family="mono">{formatDuration(selected.total_duration_ms)}</Text>
                    </div>
                    <div>
                      <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Turns</Text>
                      <Text size="sm" family="mono">{selected.total_turns}</Text>
                    </div>
                    <div>
                      <Text size="xs" color="tertiary" transform="uppercase" weight="semibold">Status</Text>
                      <Text size="sm" color={selected.is_active ? 'ok' : 'secondary'}>
                        {selected.is_active ? 'Active' : 'Ended'}
                      </Text>
                    </div>
                  </div>

                  {/* Audio timeline */}
                  {selected.transcript_turns.length > 0 && (
                    <div
                      style={{
                        background: 'var(--surface, oklch(14% 0.01 260))',
                        border: '1px solid var(--border, oklch(20% 0.01 260))',
                        borderRadius: 8,
                        padding: '14px 18px',
                      }}
                    >
                      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Heading level={3} size="sm">Audio Timeline</Heading>
                        <Text size="xs" color="tertiary">
                          <span style={{ color: 'var(--status-ok)' }}>■</span> agent
                          {' '}
                          <span style={{ color: 'var(--status-warn)' }}>■</span> user
                        </Text>
                      </div>
                      <AudioTimeline
                        turns={selected.transcript_turns}
                        totalDuration={selected.total_duration_ms || 1}
                        activeTurnId={activeTurnId}
                        onSelect={setActiveTurnId}
                      />
                    </div>
                  )}

                  {/* Transcript */}
                  <div
                    style={{
                      background: 'var(--surface, oklch(14% 0.01 260))',
                      border: '1px solid var(--border, oklch(20% 0.01 260))',
                      borderRadius: 8,
                      overflow: 'hidden',
                      maxHeight: 520,
                      overflowY: 'auto',
                    }}
                  >
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))', position: 'sticky', top: 0, background: 'var(--surface, oklch(14% 0.01 260))' }}>
                      <Heading level={3} size="sm">Transcript</Heading>
                    </div>
                    <TranscriptPanel turns={selected.transcript_turns} activeTurnId={activeTurnId} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

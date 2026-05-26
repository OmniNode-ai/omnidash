import { useState, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { Text, Heading } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';

interface ReplaySnapshot {
  snapshot_id: string;
  session_id: string;
  sequence: number;
  timestamp: string;
  event_type: string;
  node_name: string;
  state_delta: Record<string, unknown>;
  cumulative_tokens: number;
  is_checkpoint: boolean;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function EventTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    tool_call: 'var(--status-ok)',
    llm_response: 'var(--brand)',
    user_input: 'var(--status-warn)',
    checkpoint: 'var(--text-tertiary)',
    error: 'var(--bad)',
  };
  const color = colors[type.toLowerCase()] ?? 'var(--text-secondary)';
  return (
    <Text
      as="span"
      size="xs"
      family="mono"
      style={{
        padding: '2px 6px',
        borderRadius: 4,
        background: `color-mix(in oklch, ${color} 15%, transparent)`,
        border: `1px solid ${color}`,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </Text>
  );
}

function StateDeltaViewer({ delta }: { delta: Record<string, unknown> }) {
  const entries = Object.entries(delta);
  if (entries.length === 0) {
    return <Text size="xs" color="tertiary">No state changes</Text>;
  }
  return (
    <Text
      as="pre"
      size="xs"
      color="secondary"
      family="mono"
      style={{
        maxHeight: 160,
        overflow: 'auto',
        padding: 8,
        borderRadius: 4,
        border: '1px solid var(--border, oklch(20% 0.01 260))',
        background: 'var(--surface-2, oklch(18% 0.01 260))',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        margin: 0,
      }}
    >
      {JSON.stringify(delta, null, 2)}
    </Text>
  );
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
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
      {sessions.length === 0 && (
        <div style={{ padding: 16 }}>
          <Text size="sm" color="tertiary" align="center">No sessions available</Text>
        </div>
      )}
      {sessions.map((sid) => (
        <button
          key={sid}
          onClick={() => onSelect(sid)}
          style={{
            all: 'unset',
            display: 'block',
            width: '100%',
            padding: '8px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border, oklch(20% 0.01 260))',
            borderLeft: `3px solid ${sid === selectedId ? 'var(--brand, oklch(55% 0.2 260))' : 'transparent'}`,
            background: sid === selectedId ? 'color-mix(in oklch, var(--brand, oklch(55% 0.2 260)) 8%, transparent)' : 'transparent',
          }}
        >
          <Text size="sm" family="mono" truncate>{sid}</Text>
        </button>
      ))}
    </div>
  );
}

export function SessionReplayPage() {
  const { data: snapshots, isLoading, error } = useProjectionQuery<ReplaySnapshot>({
    topic: TOPICS.sessionReplay,
    queryKey: ['session-replay'],
    refetchInterval: 30_000,
  });

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const sessions = useMemo(() => {
    if (!snapshots) return [];
    return [...new Set(snapshots.map((s) => s.session_id))];
  }, [snapshots]);

  const sessionSnapshots = useMemo(() => {
    if (!snapshots || !selectedSession) return [];
    return snapshots
      .filter((s) => s.session_id === selectedSession)
      .sort((a, b) => a.sequence - b.sequence);
  }, [snapshots, selectedSession]);

  const currentSnapshot = sessionSnapshots[currentStep] ?? null;
  const totalSteps = sessionSnapshots.length;

  const handleSelectSession = (id: string) => {
    setSelectedSession(id);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));
  const handleNext = () => setCurrentStep((s) => Math.min(totalSteps - 1, s + 1));
  const handleReset = () => { setCurrentStep(0); setIsPlaying(false); };

  return (
    <>
      <div className="dash-header">
        <div className="dash-title-wrap">
          <div className="dash-title">Session Replay</div>
          <Text size="sm" color="secondary">
            Step through recorded sessions with state reconstruction
          </Text>
        </div>
        <div className="header-actions">
          {selectedSession && (
            <Text size="sm" color="tertiary" family="mono">
              {currentStep + 1} / {totalSteps} steps
            </Text>
          )}
        </div>
      </div>

      <div className="dash-body" style={{ padding: '24px 28px', overflowY: 'auto' }}>
        {isLoading && (
          <Text size="sm" color="tertiary">Loading sessions…</Text>
        )}
        {error && (
          <Text size="sm" color="secondary">Server unavailable — no replay data</Text>
        )}

        {!isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>
            <SessionList
              sessions={sessions}
              selectedId={selectedSession}
              onSelect={handleSelectSession}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!selectedSession ? (
                <div
                  style={{
                    background: 'var(--surface, oklch(14% 0.01 260))',
                    border: '1px solid var(--border, oklch(20% 0.01 260))',
                    borderRadius: 8,
                    padding: 40,
                    textAlign: 'center',
                  }}
                >
                  <Text color="tertiary" size="sm">Select a session to start replay</Text>
                </div>
              ) : (
                <>
                  {/* Playback controls */}
                  <div
                    style={{
                      background: 'var(--surface, oklch(14% 0.01 260))',
                      border: '1px solid var(--border, oklch(20% 0.01 260))',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <button
                      onClick={handleReset}
                      disabled={currentStep === 0}
                      aria-label="Reset to start"
                      style={{ all: 'unset', cursor: currentStep === 0 ? 'not-allowed' : 'pointer', opacity: currentStep === 0 ? 0.4 : 1 }}
                    >
                      <RotateCcw size={16} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={handlePrev}
                      disabled={currentStep === 0}
                      aria-label="Previous step"
                      style={{ all: 'unset', cursor: currentStep === 0 ? 'not-allowed' : 'pointer', opacity: currentStep === 0 ? 0.4 : 1 }}
                    >
                      <SkipBack size={16} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      onClick={() => setIsPlaying((p) => !p)}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      style={{ all: 'unset', cursor: 'pointer' }}
                    >
                      {isPlaying
                        ? <Pause size={18} style={{ color: 'var(--brand, oklch(55% 0.2 260))' }} />
                        : <Play size={18} style={{ color: 'var(--brand, oklch(55% 0.2 260))' }} />
                      }
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={currentStep >= totalSteps - 1}
                      aria-label="Next step"
                      style={{ all: 'unset', cursor: currentStep >= totalSteps - 1 ? 'not-allowed' : 'pointer', opacity: currentStep >= totalSteps - 1 ? 0.4 : 1 }}
                    >
                      <SkipForward size={16} style={{ color: 'var(--text-secondary)' }} />
                    </button>

                    {/* Progress bar */}
                    <div
                      style={{ flex: 1, height: 4, background: 'var(--border, oklch(20% 0.01 260))', borderRadius: 2, overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0}%`,
                          background: 'var(--brand, oklch(55% 0.2 260))',
                          transition: 'width 0.15s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Timeline list */}
                  <div
                    style={{
                      background: 'var(--surface, oklch(14% 0.01 260))',
                      border: '1px solid var(--border, oklch(20% 0.01 260))',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))' }}>
                      <Heading level={3} size="sm">Event Timeline</Heading>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {sessionSnapshots.map((snap, idx) => (
                        <button
                          key={snap.snapshot_id}
                          onClick={() => setCurrentStep(idx)}
                          style={{
                            all: 'unset',
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr auto',
                            gap: 10,
                            alignItems: 'center',
                            width: '100%',
                            padding: '8px 14px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border, oklch(20% 0.01 260))',
                            borderLeft: `3px solid ${idx === currentStep ? 'var(--brand, oklch(55% 0.2 260))' : snap.is_checkpoint ? 'var(--status-warn)' : 'transparent'}`,
                            background: idx === currentStep ? 'color-mix(in oklch, var(--brand, oklch(55% 0.2 260)) 8%, transparent)' : 'transparent',
                          }}
                        >
                          <Text size="xs" family="mono" color="tertiary">
                            {formatTimestamp(snap.timestamp)}
                          </Text>
                          <Text size="sm" color="secondary">{snap.node_name}</Text>
                          <EventTypeTag type={snap.event_type} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Current state delta */}
                  {currentSnapshot && (
                    <div
                      style={{
                        background: 'var(--surface, oklch(14% 0.01 260))',
                        border: '1px solid var(--border, oklch(20% 0.01 260))',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border, oklch(20% 0.01 260))', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Heading level={3} size="sm">State Delta</Heading>
                        <EventTypeTag type={currentSnapshot.event_type} />
                        <Text size="xs" color="tertiary" family="mono" style={{ marginLeft: 'auto' }}>
                          {currentSnapshot.cumulative_tokens} tokens
                        </Text>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <StateDeltaViewer delta={currentSnapshot.state_delta} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

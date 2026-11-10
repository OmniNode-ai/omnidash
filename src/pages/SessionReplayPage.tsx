import { useState, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from '@/theme/design-system/icons';
import { Text, Heading } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { localeTime as fmtLocaleTime } from '@/theme/format';
import { refreshInterval } from '@/theme/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in SessionReplayPage.static.css.
import './SessionReplayPage.static.css';

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
  return fmtLocaleTime(d, undefined, { hour12: false });
}

function EventTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    tool_call: 'var(--ds-status-ok)',
    llm_response: 'var(--ds-brand)',
    user_input: 'var(--ds-warn)',
    checkpoint: 'var(--ds-ink-3)',
    error: 'var(--ds-bad)',
  };
  const color = colors[type.toLowerCase()] ?? 'var(--ds-ink-2)';
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
    <Text className="session-replay-page-s780a78"
      as="pre"
      size="xs"
      color="secondary"
      family="mono"
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
    <div className="session-replay-page-s543027"
    >
      <div className="session-replay-page-safb590">
        <Text size="xs" weight="semibold" color="tertiary" transform="uppercase">Sessions</Text>
      </div>
      {sessions.length === 0 && (
        <div className="session-replay-page-s872b66">
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
            borderBottom: '1px solid var(--ds-line, var(--ds-line-soft))',
            borderLeft: `3px solid ${sid === selectedId ? 'var(--ds-brand, var(--ds-hue-blue))' : 'transparent'}`,
            background: sid === selectedId ? 'color-mix(in oklch, var(--ds-brand, var(--ds-hue-blue)) 8%, transparent)' : 'transparent',
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
    refetchInterval: refreshInterval(),
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

      <div className="dash-body session-replay-page-sea0c4d">
        {isLoading && (
          <Text size="sm" color="tertiary">Loading sessions…</Text>
        )}
        {error && (
          <Text size="sm" color="secondary">Server unavailable — no replay data</Text>
        )}

        {!isLoading && (
          <div className="session-replay-page-s6d8474">
            <SessionList
              sessions={sessions}
              selectedId={selectedSession}
              onSelect={handleSelectSession}
            />

            <div className="session-replay-page-s8ef476">
              {!selectedSession ? (
                <div className="session-replay-page-sfe0e02"
                >
                  <Text color="tertiary" size="sm">Select a session to start replay</Text>
                </div>
              ) : (
                <>
                  {/* Playback controls */}
                  <div className="session-replay-page-sd5bf69"
                  >
                    <button
                      onClick={handleReset}
                      disabled={currentStep === 0}
                      aria-label="Reset to start"
                      style={{ all: 'unset', cursor: currentStep === 0 ? 'not-allowed' : 'pointer', opacity: currentStep === 0 ? 0.4 : 1 }}
                    >
                      <RotateCcw className="session-replay-page-sc331ff" size={16} />
                    </button>
                    <button
                      onClick={handlePrev}
                      disabled={currentStep === 0}
                      aria-label="Previous step"
                      style={{ all: 'unset', cursor: currentStep === 0 ? 'not-allowed' : 'pointer', opacity: currentStep === 0 ? 0.4 : 1 }}
                    >
                      <SkipBack className="session-replay-page-sc331ff" size={16} />
                    </button>
                    <button className="session-replay-page-s7c5c86"
                      onClick={() => setIsPlaying((p) => !p)}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying
                        ? <Pause className="session-replay-page-s2dcb32" size={18} />
                        : <Play className="session-replay-page-s2dcb32" size={18} />
                      }
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={currentStep >= totalSteps - 1}
                      aria-label="Next step"
                      style={{ all: 'unset', cursor: currentStep >= totalSteps - 1 ? 'not-allowed' : 'pointer', opacity: currentStep >= totalSteps - 1 ? 0.4 : 1 }}
                    >
                      <SkipForward className="session-replay-page-sc331ff" size={16} />
                    </button>

                    {/* Progress bar */}
                    <div className="session-replay-page-s6e957d"
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0}%`,
                          background: 'var(--ds-brand, var(--ds-hue-blue))',
                          transition: 'width 0.15s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Timeline list */}
                  <div className="session-replay-page-s543027"
                  >
                    <div className="session-replay-page-safb590">
                      <Heading level={3} size="sm">Event Timeline</Heading>
                    </div>
                    <div className="session-replay-page-s8580f0">
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
                            borderBottom: '1px solid var(--ds-line, var(--ds-line-soft))',
                            borderLeft: `3px solid ${idx === currentStep ? 'var(--ds-brand, var(--ds-hue-blue))' : snap.is_checkpoint ? 'var(--ds-warn)' : 'transparent'}`,
                            background: idx === currentStep ? 'color-mix(in oklch, var(--ds-brand, var(--ds-hue-blue)) 8%, transparent)' : 'transparent',
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
                    <div className="session-replay-page-s543027"
                    >
                      <div className="session-replay-page-sd846ee">
                        <Heading level={3} size="sm">State Delta</Heading>
                        <EventTypeTag type={currentSnapshot.event_type} />
                        <Text className="session-replay-page-s538764" size="xs" color="tertiary" family="mono">
                          {currentSnapshot.cumulative_tokens} tokens
                        </Text>
                      </div>
                      <div className="session-replay-page-s3ba727">
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

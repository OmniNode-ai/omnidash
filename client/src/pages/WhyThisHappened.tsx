/**
 * WhyThisHappened — Dashboard page (OMN-2350 epic, OMN-5046 wiring)
 *
 * Hosts all four "Why This Happened" panel views:
 *   - Tab 1: Intent vs Resolved Plan (OMN-2468)
 *   - Tab 2: Decision Timeline (OMN-2469)
 *   - Tab 3: Candidate Comparison (OMN-2470)
 *   - Tab 4: Agent Narrative Overlay (OMN-2471)
 *
 * Wired to live /api/decisions/* endpoints (OMN-5046).
 * Shows a session picker populated from the sessions API.
 * When no live data is available, displays an empty state.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Info, Eye, ChevronDown } from 'lucide-react';
import {
  IntentVsPlan,
  DecisionTimeline,
  CandidateComparison,
  NarrativeOverlay,
} from '@/components/why_panel';
import { queryKeys } from '@/lib/query-keys';
import type {
  DecisionRecord,
  DecisionTimelineRow,
  DecisionTimelineResponse,
  IntentVsPlanResponse,
  DecisionSessionsResponse,
  CandidateComparisonData,
  NarrativeOverlayData,
} from '@shared/decision-record-types';

// ============================================================================
// API client helpers
// ============================================================================

async function fetchSessions(): Promise<DecisionSessionsResponse> {
  const res = await fetch('/api/decisions/sessions');
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json() as Promise<DecisionSessionsResponse>;
}

async function fetchTimeline(sessionId: string): Promise<DecisionTimelineResponse> {
  const res = await fetch(`/api/decisions/timeline?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.status}`);
  return res.json() as Promise<DecisionTimelineResponse>;
}

async function fetchIntentVsPlan(sessionId: string): Promise<IntentVsPlanResponse> {
  const res = await fetch(
    `/api/decisions/intent-vs-plan?session_id=${encodeURIComponent(sessionId)}`
  );
  if (res.status === 404) {
    // No records for this session yet — return empty
    return { session_id: sessionId, executed_at: new Date().toISOString(), fields: [] };
  }
  if (!res.ok) throw new Error(`Failed to fetch intent-vs-plan: ${res.status}`);
  return res.json() as Promise<IntentVsPlanResponse>;
}

// ============================================================================
// Data transform helpers
// ============================================================================

function buildCandidateComparisonData(record: DecisionRecord): CandidateComparisonData {
  const metricSet = new Set<string>();
  for (const c of record.candidates_considered) {
    if (c.scoring_breakdown) {
      for (const k of Object.keys(c.scoring_breakdown)) {
        metricSet.add(k);
      }
    }
  }
  const metric_columns = Array.from(metricSet);

  return {
    decision_id: record.decision_id,
    decision_type: record.decision_type,
    decided_at: record.decided_at,
    metric_columns,
    rows: record.candidates_considered.map((c) => ({
      id: c.id,
      selected: c.selected,
      eliminated: c.eliminated,
      elimination_reason: c.elimination_reason,
      scores: Object.fromEntries(metric_columns.map((m) => [m, c.scoring_breakdown?.[m] ?? null])),
      total_score: c.total_score ?? null,
    })),
    constraints_applied: record.constraints_applied,
    tie_breaker: record.tie_breaker,
  };
}

function buildNarrativeOverlayData(record: DecisionRecord): NarrativeOverlayData {
  const selectedCandidate = record.candidates_considered.find((c) => c.selected);
  const layer1Keywords = [
    ...record.constraints_applied.map((c) => c.description.toLowerCase()),
    ...record.candidates_considered
      .flatMap((c) => Object.keys(c.scoring_breakdown ?? {}))
      .map((k) => k.toLowerCase()),
  ];

  const mismatches = [];
  if (record.agent_rationale) {
    const costMentioned = record.agent_rationale.toLowerCase().includes('cost');
    const costInLayer1 = layer1Keywords.some((k) => k.includes('cost'));
    if (costMentioned && !costInLayer1) {
      mismatches.push({
        conflicting_reference: 'cost',
        explanation: 'no cost constraint appears in Layer 1 provenance.',
      });
    }
  }

  return {
    decision_id: record.decision_id,
    layer1_summary: {
      selected_candidate: record.selected_candidate,
      constraints_count: record.constraints_applied.length,
      candidates_count: record.candidates_considered.length,
      top_constraint: record.constraints_applied[0]?.description,
      score: selectedCandidate?.total_score ?? null,
    },
    agent_rationale: record.agent_rationale,
    mismatches,
  };
}

// ============================================================================
// Session Picker
// ============================================================================

function SessionPicker({
  sessions,
  selectedSessionId,
  onSelect,
}: {
  sessions: DecisionSessionsResponse;
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (sessions.total === 0) return null;

  const selectedSession = sessions.sessions.find((s) => s.session_id === selectedSessionId);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="min-w-[200px] justify-between text-xs"
        data-testid="session-picker"
      >
        <span className="truncate max-w-[250px]">
          {selectedSession
            ? `${selectedSession.session_id.slice(0, 24)}... (${selectedSession.decision_count} decisions)`
            : 'Select session...'}
        </span>
        <ChevronDown className="h-3 w-3 ml-1.5 shrink-0" />
      </Button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-[400px] max-h-[300px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
          data-testid="session-picker-dropdown"
        >
          {sessions.sessions.map((s) => (
            <button
              key={s.session_id}
              className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent cursor-pointer ${
                s.session_id === selectedSessionId ? 'bg-accent font-medium' : ''
              }`}
              onClick={() => {
                onSelect(s.session_id);
                setOpen(false);
              }}
              data-testid={`session-option-${s.session_id}`}
            >
              <div className="font-mono truncate">{s.session_id}</div>
              <div className="text-muted-foreground mt-0.5">
                {s.decision_count} decision{s.decision_count !== 1 ? 's' : ''} &middot;{' '}
                {new Date(s.last_decided_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

/** Active tab in the Why This Happened panel. */
type ActiveView = 'intent' | 'timeline' | 'comparison' | 'narrative';

export default function WhyThisHappened() {
  const [activeView, setActiveView] = useState<ActiveView>('intent');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Fetch available sessions
  // --------------------------------------------------------------------------
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: queryKeys.decisions.sessions(),
    queryFn: fetchSessions,
    staleTime: 15_000,
    refetchInterval: 30_000, // Poll for new sessions
  });

  // Auto-select the newest session when sessions load and none is selected
  const effectiveSessionId = useMemo(() => {
    if (selectedSessionId) return selectedSessionId;
    if (sessionsData && sessionsData.sessions.length > 0) {
      return sessionsData.sessions[0].session_id;
    }
    return null;
  }, [selectedSessionId, sessionsData]);

  // --------------------------------------------------------------------------
  // Fetch timeline for selected session
  // --------------------------------------------------------------------------
  const {
    data: timelineData,
    isLoading: timelineLoading,
    refetch: refetchTimeline,
  } = useQuery({
    queryKey: queryKeys.decisions.timeline(effectiveSessionId ?? ''),
    queryFn: () => fetchTimeline(effectiveSessionId!),
    enabled: !!effectiveSessionId,
    staleTime: 15_000,
  });

  // --------------------------------------------------------------------------
  // Fetch intent-vs-plan for selected session
  // --------------------------------------------------------------------------
  const { data: intentData, isLoading: intentLoading } = useQuery({
    queryKey: queryKeys.decisions.intentVsPlan(effectiveSessionId ?? ''),
    queryFn: () => fetchIntentVsPlan(effectiveSessionId!),
    enabled: !!effectiveSessionId,
    staleTime: 15_000,
  });

  // --------------------------------------------------------------------------
  // Derived data from timeline records
  // --------------------------------------------------------------------------
  const decisionRecords: DecisionRecord[] = useMemo(
    () => (timelineData?.rows ?? []).map((row: DecisionTimelineRow) => row.full_record),
    [timelineData]
  );

  const timelineRows: DecisionTimelineRow[] = useMemo(
    () => timelineData?.rows ?? [],
    [timelineData]
  );

  // Ensure selectedDecisionId is valid for current records
  const effectiveDecisionId = useMemo(() => {
    if (selectedDecisionId && decisionRecords.some((r) => r.decision_id === selectedDecisionId)) {
      return selectedDecisionId;
    }
    return decisionRecords[0]?.decision_id ?? null;
  }, [selectedDecisionId, decisionRecords]);

  const selectedRecord = useMemo(
    () => decisionRecords.find((r) => r.decision_id === effectiveDecisionId) ?? null,
    [decisionRecords, effectiveDecisionId]
  );

  const comparisonData = useMemo(
    () => (selectedRecord ? buildCandidateComparisonData(selectedRecord) : null),
    [selectedRecord]
  );

  const narrativeData = useMemo(
    () => (selectedRecord ? buildNarrativeOverlayData(selectedRecord) : null),
    [selectedRecord]
  );

  // Navigate to candidate comparison when user drills in from timeline
  const handleDecisionClick = useCallback((decisionId: string) => {
    setSelectedDecisionId(decisionId);
    setActiveView('comparison');
  }, []);

  const handleRefresh = useCallback(() => {
    void refetchSessions();
    void refetchTimeline();
  }, [refetchSessions, refetchTimeline]);

  const hasLiveData = (sessionsData?.total ?? 0) > 0;
  const isLoading = sessionsLoading || (!!effectiveSessionId && timelineLoading);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-4" data-testid="why-this-happened-page">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Why This Happened</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Decision provenance panel — every inference is traceable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessionsData && (
            <SessionPicker
              sessions={sessionsData}
              selectedSessionId={effectiveSessionId}
              onSelect={setSelectedSessionId}
            />
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="refresh-btn">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Empty state when no live data */}
      {!isLoading && !hasLiveData && (
        <Alert className="border-blue-500/30 bg-blue-500/10">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs text-muted-foreground">
            No decision provenance events received yet. Once agent routing decisions flow through
            Kafka, live sessions will appear here automatically.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {/* Four-view tab panel — only shown when we have data */}
      {!isLoading && hasLiveData && effectiveSessionId && (
        <Tabs
          value={activeView}
          onValueChange={(v) => setActiveView(v as ActiveView)}
          data-testid="why-panel-tabs"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="intent" data-testid="tab-intent">
              Intent vs Plan
            </TabsTrigger>
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              Decision Timeline
            </TabsTrigger>
            <TabsTrigger value="comparison" data-testid="tab-comparison">
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Candidate Comparison
            </TabsTrigger>
            <TabsTrigger value="narrative" data-testid="tab-narrative">
              Narrative Overlay
            </TabsTrigger>
          </TabsList>

          {/* View 1: Intent vs Resolved Plan */}
          <TabsContent value="intent" className="mt-4">
            {intentLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : intentData && intentData.fields.length > 0 ? (
              <IntentVsPlan
                data={intentData}
                onDecisionClick={handleDecisionClick}
                data-testid="intent-vs-plan-view"
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No intent-vs-plan data for this session.
              </p>
            )}
          </TabsContent>

          {/* View 2: Decision Timeline */}
          <TabsContent value="timeline" className="mt-4">
            {timelineRows.length > 0 ? (
              <DecisionTimeline
                rows={timelineRows}
                onViewCandidates={handleDecisionClick}
                data-testid="decision-timeline-view"
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No decision timeline data for this session.
              </p>
            )}
          </TabsContent>

          {/* View 3: Candidate Comparison */}
          <TabsContent value="comparison" className="mt-4">
            {decisionRecords.length > 0 && comparisonData ? (
              <>
                {/* Decision selector for comparison view */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-muted-foreground">Viewing decision:</span>
                  {decisionRecords.map((r) => (
                    <Button
                      key={r.decision_id}
                      variant={effectiveDecisionId === r.decision_id ? 'secondary' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setSelectedDecisionId(r.decision_id)}
                      data-testid={`select-decision-btn-${r.decision_id}`}
                    >
                      {r.decision_type} — {r.selected_candidate}
                    </Button>
                  ))}
                </div>
                <CandidateComparison
                  data={comparisonData}
                  data-testid="candidate-comparison-view"
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No candidate comparison data for this session.
              </p>
            )}
          </TabsContent>

          {/* View 4: Agent Narrative Overlay */}
          <TabsContent value="narrative" className="mt-4">
            {decisionRecords.filter((r) => r.agent_rationale !== null).length > 0 &&
            narrativeData ? (
              <>
                {/* Decision selector for narrative view */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-xs text-muted-foreground">Viewing decision:</span>
                  {decisionRecords
                    .filter((r) => r.agent_rationale !== null)
                    .map((r) => (
                      <Button
                        key={r.decision_id}
                        variant={effectiveDecisionId === r.decision_id ? 'secondary' : 'outline'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setSelectedDecisionId(r.decision_id)}
                        data-testid={`select-narrative-btn-${r.decision_id}`}
                      >
                        {r.decision_type}
                      </Button>
                    ))}
                </div>
                <NarrativeOverlay data={narrativeData} data-testid="narrative-overlay-view" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No narrative overlay data for this session.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

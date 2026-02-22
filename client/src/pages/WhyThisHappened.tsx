/**
 * WhyThisHappened — Dashboard page (OMN-2350 epic)
 *
 * Hosts all four "Why This Happened" panel views:
 *   - Tab 1: Intent vs Resolved Plan (OMN-2468)
 *   - Tab 2: Decision Timeline (OMN-2469)
 *   - Tab 3: Candidate Comparison (OMN-2470)
 *   - Tab 4: Agent Narrative Overlay (OMN-2471)
 *
 * Uses mock data until OMN-2467 (DecisionRecord storage + query API) ships.
 * The API client is wired up but falls back to mock data when the backend
 * returns 404 or is unreachable.
 *
 * Dependencies: OMN-2467 (DecisionRecord storage + query API)
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Info, Eye } from 'lucide-react';
import { MockDataBadge } from '@/components/MockDataBadge';
import { useDemoMode } from '@/contexts/DemoModeContext';
import {
  IntentVsPlan,
  DecisionTimeline,
  CandidateComparison,
  NarrativeOverlay,
} from '@/components/why_panel';
import type {
  DecisionRecord,
  IntentVsPlanData,
  DecisionTimelineRow,
  CandidateComparisonData,
  NarrativeOverlayData,
} from '@shared/decision-record-types';

// ============================================================================
// Mock data (used until OMN-2467 ships)
// ============================================================================

const MOCK_SESSION_ID = 'session-f1faceb2-demo';

const MOCK_INTENT_VS_PLAN: IntentVsPlanData = {
  session_id: MOCK_SESSION_ID,
  executed_at: new Date(Date.now() - 60_000).toISOString(),
  fields: [
    {
      field_name: 'Model',
      intent_value: null,
      resolved_value: 'claude-opus-4-6',
      origin: 'inferred',
      decision_id: 'dr-001',
    },
    {
      field_name: 'Tools',
      intent_value: 'Read, Write',
      resolved_value: 'Read, Write, Bash',
      origin: 'inferred',
      decision_id: 'dr-002',
    },
    {
      field_name: 'Context',
      intent_value: '/my/project',
      resolved_value: '/my/project',
      origin: 'user_specified',
      decision_id: null,
    },
    {
      field_name: 'Default timeout',
      intent_value: null,
      resolved_value: '30s',
      origin: 'default',
      decision_id: 'dr-003',
    },
    {
      field_name: 'Agent',
      intent_value: null,
      resolved_value: 'agent-api-architect',
      origin: 'inferred',
      decision_id: 'dr-004',
    },
  ],
};

const MOCK_DECISION_RECORDS: DecisionRecord[] = [
  {
    decision_id: 'dr-001',
    session_id: MOCK_SESSION_ID,
    decided_at: new Date(Date.now() - 62_000).toISOString(),
    decision_type: 'model_select' as const,
    selected_candidate: 'claude-opus-4-6',
    candidates_considered: [
      {
        id: 'claude-opus-4-6',
        eliminated: false,
        selected: true,
        scoring_breakdown: { latency: 0.91, context: 1.0, tools: 1.0 },
        total_score: 0.94,
      },
      {
        id: 'claude-sonnet-4-6',
        eliminated: false,
        selected: false,
        scoring_breakdown: { latency: 0.95, context: 0.9, tools: 1.0 },
        total_score: 0.87,
      },
      {
        id: 'claude-haiku-4-5',
        eliminated: true,
        elimination_reason: 'context_length < 100k',
        selected: false,
        scoring_breakdown: {},
        total_score: null,
      },
    ],
    constraints_applied: [
      {
        description: 'context_length >= 100k',
        eliminates: ['claude-haiku-4-5'],
        satisfied_by_selected: true,
      },
      {
        description: 'supports_tools = true',
        eliminates: [],
        satisfied_by_selected: true,
      },
    ],
    tie_breaker: null,
    agent_rationale:
      'I chose claude-opus-4-6 because it balances capability and cost effectively for this task, and it has the best track record for complex reasoning.',
  },
  {
    decision_id: 'dr-002',
    session_id: MOCK_SESSION_ID,
    decided_at: new Date(Date.now() - 61_500).toISOString(),
    decision_type: 'tool_select' as const,
    selected_candidate: 'Read, Write, Bash',
    candidates_considered: [
      {
        id: 'Read, Write, Bash',
        eliminated: false,
        selected: true,
        scoring_breakdown: { coverage: 1.0, safety: 0.85 },
        total_score: 0.93,
      },
      {
        id: 'Read, Write',
        eliminated: false,
        selected: false,
        scoring_breakdown: { coverage: 0.7, safety: 1.0 },
        total_score: 0.78,
      },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale: null,
  },
  {
    decision_id: 'dr-004',
    session_id: MOCK_SESSION_ID,
    decided_at: new Date(Date.now() - 61_000).toISOString(),
    decision_type: 'route_select' as const,
    selected_candidate: 'agent-api-architect',
    candidates_considered: [
      {
        id: 'agent-api-architect',
        eliminated: false,
        selected: true,
        scoring_breakdown: { relevance: 0.95, specialization: 0.9 },
        total_score: 0.93,
      },
      {
        id: 'polymorphic-agent',
        eliminated: false,
        selected: false,
        scoring_breakdown: { relevance: 0.7, specialization: 0.5 },
        total_score: 0.62,
      },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale:
      'The user prompt mentions API design, which strongly matches agent-api-architect. Cost efficiency also favors a specialized agent.',
  },
  {
    decision_id: 'dr-003',
    session_id: MOCK_SESSION_ID,
    decided_at: new Date(Date.now() - 60_500).toISOString(),
    decision_type: 'default_apply' as const,
    selected_candidate: '30s',
    candidates_considered: [
      {
        id: '30s',
        eliminated: false,
        selected: true,
        scoring_breakdown: {},
        total_score: null,
      },
    ],
    constraints_applied: [],
    tie_breaker: null,
    agent_rationale: null,
  },
];

const MOCK_TIMELINE_ROWS: DecisionTimelineRow[] = MOCK_DECISION_RECORDS.map((r) => ({
  decision_id: r.decision_id,
  decided_at: r.decided_at,
  decision_type: r.decision_type,
  selected_candidate: r.selected_candidate,
  candidates_count: r.candidates_considered.length,
  full_record: r,
}));

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
// Main Page
// ============================================================================

/** Active tab in the Why This Happened panel. */
type ActiveView = 'intent' | 'timeline' | 'comparison' | 'narrative';

export default function WhyThisHappened() {
  const { isDemoMode } = useDemoMode();
  const [activeView, setActiveView] = useState<ActiveView>('intent');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>(
    MOCK_DECISION_RECORDS[0].decision_id
  );

  // Navigate to candidate comparison when user drills in from timeline
  const handleDecisionClick = useCallback((decisionId: string) => {
    setSelectedDecisionId(decisionId);
    setActiveView('comparison');
  }, []);

  // In a real implementation this would hit the OMN-2467 API endpoint
  const {
    data: intentData,
    isLoading: intentLoading,
    refetch,
  } = useQuery({
    queryKey: ['why-this-happened', 'intent', MOCK_SESSION_ID],
    queryFn: async () => {
      // TODO: Replace with real API call once OMN-2467 ships:
      // const res = await fetch(`/api/decisions/intent-vs-plan?session_id=${MOCK_SESSION_ID}`);
      // if (!res.ok) throw new Error('API not available');
      // return res.json() as Promise<IntentVsPlanData>;
      return MOCK_INTENT_VS_PLAN;
    },
    staleTime: 30_000,
  });

  const selectedRecord =
    MOCK_DECISION_RECORDS.find((r) => r.decision_id === selectedDecisionId) ??
    MOCK_DECISION_RECORDS[0];

  const comparisonData = buildCandidateComparisonData(selectedRecord);
  const narrativeData = buildNarrativeOverlayData(selectedRecord);

  return (
    <div className="space-y-4" data-testid="why-this-happened-page">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Why This Happened</h2>
            <MockDataBadge />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Decision provenance panel — every inference is traceable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            data-testid="refresh-btn"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Trust invariant notice — shown unconditionally until OMN-2467 API is active */}
      <Alert className="border-blue-500/30 bg-blue-500/8">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-xs text-muted-foreground">
          Showing mock DecisionRecord data. Connect to OMN-2467 API for live provenance.
        </AlertDescription>
      </Alert>

      {/* Four-view tab panel */}
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
          ) : intentData ? (
            <IntentVsPlan
              data={intentData}
              onDecisionClick={handleDecisionClick}
              data-testid="intent-vs-plan-view"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center">No intent data available.</p>
          )}
        </TabsContent>

        {/* View 2: Decision Timeline */}
        <TabsContent value="timeline" className="mt-4">
          <DecisionTimeline
            rows={MOCK_TIMELINE_ROWS}
            onViewCandidates={handleDecisionClick}
            data-testid="decision-timeline-view"
          />
        </TabsContent>

        {/* View 3: Candidate Comparison */}
        <TabsContent value="comparison" className="mt-4">
          {/* Decision selector for comparison view */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-muted-foreground">Viewing decision:</span>
            {MOCK_DECISION_RECORDS.map((r) => (
              <Button
                key={r.decision_id}
                variant={selectedDecisionId === r.decision_id ? 'secondary' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setSelectedDecisionId(r.decision_id)}
                data-testid={`select-decision-btn-${r.decision_id}`}
              >
                {r.decision_type} — {r.selected_candidate}
              </Button>
            ))}
          </div>
          <CandidateComparison data={comparisonData} data-testid="candidate-comparison-view" />
        </TabsContent>

        {/* View 4: Agent Narrative Overlay */}
        <TabsContent value="narrative" className="mt-4">
          {/* Decision selector for narrative view */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-muted-foreground">Viewing decision:</span>
            {MOCK_DECISION_RECORDS.filter((r) => r.agent_rationale !== null).map((r) => (
              <Button
                key={r.decision_id}
                variant={selectedDecisionId === r.decision_id ? 'secondary' : 'outline'}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

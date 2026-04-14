/**
 * Hot Nodes Dashboard (OMN-8695)
 *
 * Shows nodes ranked by event volume (routing decision count) over a
 * configurable time window. Operators use this to spot traffic hotspots.
 *
 * Route: /hot-nodes
 * API:   GET /api/nodes/hot?window=1h|24h|7d
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Activity, Flame } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface HotNode {
  node_id: string;
  service_name: string;
  event_count: number;
  last_seen: string;
  rank: number;
}

interface HotNodesResponse {
  window: string;
  source: string;
  timestamp: string;
  nodes: HotNode[];
}

type Window = '1h' | '24h' | '7d';

// ============================================================================
// Helpers
// ============================================================================

function relativeTime(isoTs: string): string {
  if (!isoTs) return 'never';
  const ts = new Date(isoTs).getTime();
  if (isNaN(ts)) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function fetchHotNodes(window: Window): Promise<HotNodesResponse> {
  const res = await fetch(`/api/nodes/hot?window=${window}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<HotNodesResponse>;
}

// ============================================================================
// Sub-components
// ============================================================================

function WindowSelector({
  value,
  onChange,
}: {
  value: Window;
  onChange: (w: Window) => void;
}) {
  const windows: Window[] = ['1h', '24h', '7d'];
  return (
    <div className="flex gap-1">
      {windows.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={`px-3 py-1 text-xs rounded font-mono transition-colors ${
            value === w
              ? 'bg-orange-500 text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Badge className="bg-orange-500 text-white font-mono">#1</Badge>;
  if (rank === 2) return <Badge className="bg-slate-400 text-white font-mono">#2</Badge>;
  if (rank === 3) return <Badge className="bg-amber-700 text-white font-mono">#3</Badge>;
  return <span className="text-xs text-muted-foreground font-mono">#{rank}</span>;
}

function SkeletonRow() {
  return (
    <TableRow>
      {[...Array(5)].map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function HotNodesDashboard() {
  const [window, setWindow] = useState<Window>('1h');

  const { data, isLoading, isError, error } = useQuery<HotNodesResponse, Error>({
    queryKey: ['hot-nodes', window],
    queryFn: () => fetchHotNodes(window),
    refetchInterval: 30_000,
  });

  const isFallback = data?.source === 'node_service_registry_fallback';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-orange-500" />
          <div>
            <h1 className="text-xl font-semibold">Hot Nodes</h1>
            <p className="text-sm text-muted-foreground">
              Nodes ranked by event volume — top 20 by routing decision count
            </p>
          </div>
        </div>
        <WindowSelector value={window} onChange={setWindow} />
      </div>

      {/* Source badge */}
      {data && (
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Source: {isFallback ? 'node_service_registry (no routing data in window)' : 'agent_routing_decisions'}
          </span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Traffic Distribution</CardTitle>
          <CardDescription>
            Top nodes by event count in the last {window}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-destructive py-4">{error?.message ?? 'Failed to load'}</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Node / Service</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(10)].map((_, i) => <SkeletonRow key={i} />)
                : (data?.nodes ?? []).map((node) => (
                    <TableRow key={node.node_id}>
                      <TableCell>
                        <RankBadge rank={node.rank} />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{node.service_name}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {isFallback ? '—' : node.event_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {relativeTime(node.last_seen as string)}
                      </TableCell>
                    </TableRow>
                  ))}
              {!isLoading && data?.nodes?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No routing events in the last {window}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

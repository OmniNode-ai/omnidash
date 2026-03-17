/**
 * OmniMemory Dashboard (OMN-5290)
 *
 * Displays document ingestion timeline, memory store stats, and retrieval metrics.
 * Data sourced from:
 *   GET /api/memory/stats
 *   GET /api/memory/documents
 *   GET /api/memory/retrievals
 *
 * Topics consumed (via read-model projection):
 *   onex.evt.omnimemory.document-discovered.v1
 *   onex.evt.omnimemory.memory-stored.v1
 *   onex.evt.omnimemory.memory-retrieval-response.v1
 *   onex.evt.omnimemory.memory-expired.v1
 */

import { useQuery } from '@tanstack/react-query';
import {
  Database,
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricCard } from '@/components/MetricCard';
import { POLLING_INTERVAL_SLOW } from '@/lib/constants/query-config';

// ============================================================================
// Types (matching server response shapes)
// ============================================================================

interface MemoryStats {
  totalDocuments: number;
  byStatus: Record<string, number>;
  totalRetrievals: number;
  retrievalSuccessRate: number | null;
}

interface MemoryDocumentRow {
  id: string;
  documentId: string;
  sourcePath: string | null;
  sourceType: string | null;
  contentHash: string | null;
  sizeBytes: number | null;
  status: string;
  memoryBackend: string | null;
  correlationId: string | null;
  sessionId: string | null;
  eventTimestamp: string;
  ingestedAt: string;
}

interface MemoryRetrievalRow {
  id: string;
  correlationId: string | null;
  sessionId: string | null;
  queryType: string | null;
  resultCount: number;
  success: boolean;
  latencyMs: number | null;
  errorMessage: string | null;
  eventTimestamp: string;
  ingestedAt: string;
}

interface PaginatedDocuments {
  total: number;
  rows: MemoryDocumentRow[];
}

interface PaginatedRetrievals {
  total: number;
  rows: MemoryRetrievalRow[];
}

// ============================================================================
// Helpers
// ============================================================================

function fmtTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function statusBadge(status: string): React.ReactNode {
  const variants: Record<string, string> = {
    stored: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    discovered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    expired: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };
  const cls = variants[status] ?? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function MemoryDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useQuery<MemoryStats>({
    queryKey: ['memory', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/memory/stats', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: POLLING_INTERVAL_SLOW,
  });

  const {
    data: documents,
    isLoading: docsLoading,
    refetch: refetchDocs,
  } = useQuery<PaginatedDocuments>({
    queryKey: ['memory', 'documents'],
    queryFn: async () => {
      const res = await fetch('/api/memory/documents?limit=50', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: POLLING_INTERVAL_SLOW,
  });

  const {
    data: retrievals,
    isLoading: retrievalsLoading,
    refetch: refetchRetrievals,
  } = useQuery<PaginatedRetrievals>({
    queryKey: ['memory', 'retrievals'],
    queryFn: async () => {
      const res = await fetch('/api/memory/retrievals?limit=50', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: POLLING_INTERVAL_SLOW,
  });

  function handleRefresh() {
    void refetchStats();
    void refetchDocs();
    void refetchRetrievals();
  }

  const totalDocuments = stats?.totalDocuments ?? 0;
  const storedCount = stats?.byStatus?.stored ?? 0;
  const discoveredCount = stats?.byStatus?.discovered ?? 0;
  const expiredCount = stats?.byStatus?.expired ?? 0;
  const totalRetrievals = stats?.totalRetrievals ?? 0;
  const successRate = stats?.retrievalSuccessRate;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OmniMemory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Document ingestion timeline, memory store stats, and retrieval metrics
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={statsFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${statsFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats error */}
      {statsError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load memory stats: {statsError instanceof Error ? statsError.message : 'Unknown error'}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </>
        ) : (
          <>
            <MetricCard
              label="Total Documents"
              value={totalDocuments.toLocaleString()}
              icon={Database}
              subtitle="All documents in the memory store"
            />
            <MetricCard
              label="Stored"
              value={storedCount.toLocaleString()}
              icon={CheckCircle2}
              status="healthy"
              subtitle="Documents fully ingested"
            />
            <MetricCard
              label="Total Retrievals"
              value={totalRetrievals.toLocaleString()}
              icon={Search}
              subtitle="All retrieval requests"
            />
            <MetricCard
              label="Success Rate (24h)"
              value={successRate != null ? `${successRate}%` : '—'}
              icon={successRate == null ? Clock : successRate >= 80 ? CheckCircle2 : XCircle}
              status={
                successRate == null
                  ? undefined
                  : successRate >= 80
                    ? 'healthy'
                    : 'warning'
              }
              subtitle="Retrieval success rate (last 24h)"
            />
          </>
        )}
      </div>

      {/* Status breakdown */}
      {!statsLoading && totalDocuments > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Document Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats?.byStatus ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([status, cnt]) => (
                  <div key={status} className="flex items-center gap-2">
                    {statusBadge(status)}
                    <span className="text-sm font-medium">{cnt.toLocaleString()}</span>
                  </div>
                ))}
              {discoveredCount > 0 && (
                <span className="text-sm text-muted-foreground self-center">
                  ({discoveredCount.toLocaleString()} pending ingestion)
                </span>
              )}
              {expiredCount > 0 && (
                <span className="text-sm text-muted-foreground self-center">
                  ({expiredCount.toLocaleString()} expired)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Recent Documents
              </CardTitle>
              <CardDescription className="mt-1">
                {documents ? `${documents.total.toLocaleString()} total documents` : 'Loading…'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {docsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !documents?.rows.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No documents ingested yet. Events will appear here as omnimemory processes files.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document ID</TableHead>
                    <TableHead>Source Path</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Backend</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs max-w-[12rem] truncate">
                        {row.documentId}
                      </TableCell>
                      <TableCell className="text-xs max-w-[16rem] truncate">
                        {row.sourcePath ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.sourceType ? (
                          <Badge variant="outline" className="text-xs">
                            {row.sourceType}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtBytes(row.sizeBytes)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs">{row.memoryBackend ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtTimestamp(row.eventTimestamp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retrievals table */}
      <Card>
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Recent Retrievals
            </CardTitle>
            <CardDescription className="mt-1">
              {retrievals ? `${retrievals.total.toLocaleString()} total retrievals` : 'Loading…'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {retrievalsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !retrievals?.rows.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No retrieval events yet. Events will appear here as queries are processed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correlation ID</TableHead>
                    <TableHead>Query Type</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retrievals.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs max-w-[12rem] truncate">
                        {row.correlationId ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.queryType ? (
                          <Badge variant="outline" className="text-xs">
                            {row.queryType}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {row.resultCount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {row.success ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.latencyMs != null ? `${row.latencyMs}ms` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtTimestamp(row.eventTimestamp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

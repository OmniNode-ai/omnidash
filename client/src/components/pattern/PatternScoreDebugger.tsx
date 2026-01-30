/**
 * PatternScoreDebugger
 * Sheet showing detailed evidence for pattern scoring
 */
import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LifecycleStateBadge } from './LifecycleStateBadge';
import { ScoringEvidenceCard } from './ScoringEvidenceCard';
import { Code2 } from 'lucide-react';
import type {
  PatlearnArtifact,
  ScoringEvidence,
  PatternSignature,
} from '@/lib/schemas/api-response-schemas';

interface PatternScoreDebuggerProps {
  artifact: PatlearnArtifact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Validates that scoringEvidence has the expected nested structure.
 * Returns true if all required nested objects exist with their score properties.
 */
function isValidScoringEvidence(evidence: unknown): evidence is ScoringEvidence {
  if (!evidence || typeof evidence !== 'object') return false;
  const e = evidence as Record<string, unknown>;

  // Check labelAgreement
  if (!e.labelAgreement || typeof e.labelAgreement !== 'object') return false;
  const la = e.labelAgreement as Record<string, unknown>;
  if (typeof la.score !== 'number') return false;

  // Check clusterCohesion
  if (!e.clusterCohesion || typeof e.clusterCohesion !== 'object') return false;
  const cc = e.clusterCohesion as Record<string, unknown>;
  if (typeof cc.score !== 'number') return false;

  // Check frequencyFactor
  if (!e.frequencyFactor || typeof e.frequencyFactor !== 'object') return false;
  const ff = e.frequencyFactor as Record<string, unknown>;
  if (typeof ff.score !== 'number') return false;

  return true;
}

/**
 * Validates that signature has the expected structure.
 */
function isValidSignature(sig: unknown): sig is PatternSignature {
  if (!sig || typeof sig !== 'object') return false;
  const s = sig as Record<string, unknown>;
  return typeof s.hash === 'string' && Array.isArray(s.inputs);
}

/**
 * Validates that metrics has the expected structure.
 */
function isValidMetrics(m: unknown): m is PatlearnArtifact['metrics'] {
  if (!m || typeof m !== 'object') return false;
  const metrics = m as Record<string, unknown>;
  return typeof metrics.processingTimeMs === 'number';
}

/**
 * Fallback component for unavailable data sections
 */
function DataUnavailable({ section }: { section: string }) {
  return (
    <div className="py-8 text-center text-muted-foreground">
      <p className="text-sm">{section} data unavailable</p>
      <p className="text-xs mt-1">The data may be incomplete or malformed</p>
    </div>
  );
}

export function PatternScoreDebugger({ artifact, open, onOpenChange }: PatternScoreDebuggerProps) {
  // Extract metadata (includes description and codeExample for demo patterns)
  const metadata = artifact?.metadata ?? {};
  const { description, codeExample } = metadata;

  // Default to "overview" tab only if there's meaningful content, otherwise "scoring"
  const hasOverviewContent = Boolean(description || codeExample);

  // Controlled tab state - resets when artifact changes
  // Initialize with correct value to avoid unnecessary render on mount
  const [activeTab, setActiveTab] = useState<string>(() =>
    hasOverviewContent ? 'overview' : 'scoring'
  );

  // Track previous artifact ID to detect actual changes (not initial mount)
  const prevArtifactIdRef = useRef<string | undefined>(artifact?.id);

  // Reset tab only when artifact ID actually changes
  useEffect(() => {
    if (prevArtifactIdRef.current !== artifact?.id) {
      prevArtifactIdRef.current = artifact?.id;
      setActiveTab(hasOverviewContent ? 'overview' : 'scoring');
    }
  }, [artifact?.id, hasOverviewContent]);

  if (!artifact) return null;

  const { scoringEvidence, signature, metrics } = artifact;

  // Validate nested data structures
  const hasScoringEvidence = isValidScoringEvidence(scoringEvidence);
  const hasSignature = isValidSignature(signature);
  const hasMetrics = isValidMetrics(metrics);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <SheetTitle className="text-lg">{artifact.patternName}</SheetTitle>
            <LifecycleStateBadge state={artifact.lifecycleState} />
          </div>
          <SheetDescription className="flex items-center gap-4">
            <span>{artifact.patternType}</span>
            {artifact.language && <Badge variant="outline">{artifact.language}</Badge>}
            <span className="font-mono text-lg font-bold">
              {(artifact.compositeScore * 100).toFixed(0)}%
            </span>
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scoring">Scoring</TabsTrigger>
            <TabsTrigger value="signature">Signature</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {description ? (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                <p className="text-sm leading-relaxed">{description}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description available</p>
            )}

            {codeExample && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Code Example
                </h4>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono">
                  <code>{codeExample}</code>
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scoring" className="space-y-3 mt-4">
            {!hasScoringEvidence ? (
              <DataUnavailable section="Scoring evidence" />
            ) : (
              <>
                <ScoringEvidenceCard
                  title="Label Agreement"
                  score={scoringEvidence.labelAgreement.score}
                  defaultExpanded
                >
                  <div className="space-y-2">
                    <div>
                      <strong>Matched:</strong>{' '}
                      {scoringEvidence.labelAgreement.matchedLabels?.join(', ') || 'None'}
                    </div>
                    <div>
                      <strong>Total Labels:</strong>{' '}
                      {scoringEvidence.labelAgreement.totalLabels ?? 'N/A'}
                    </div>
                    {scoringEvidence.labelAgreement.disagreements &&
                      scoringEvidence.labelAgreement.disagreements.length > 0 && (
                        <div className="text-red-600">
                          <strong>Disagreements:</strong>{' '}
                          {scoringEvidence.labelAgreement.disagreements.join(', ')}
                        </div>
                      )}
                  </div>
                </ScoringEvidenceCard>

                <ScoringEvidenceCard
                  title="Cluster Cohesion"
                  score={scoringEvidence.clusterCohesion.score}
                >
                  <div className="space-y-2">
                    <div>
                      <strong>Cluster ID:</strong>{' '}
                      <code>{scoringEvidence.clusterCohesion.clusterId ?? 'Unknown'}</code>
                    </div>
                    <div>
                      <strong>Member Count:</strong>{' '}
                      {scoringEvidence.clusterCohesion.memberCount ?? 'N/A'}
                    </div>
                    <div>
                      <strong>Avg Pairwise Similarity:</strong>{' '}
                      {typeof scoringEvidence.clusterCohesion.avgPairwiseSimilarity === 'number'
                        ? `${(scoringEvidence.clusterCohesion.avgPairwiseSimilarity * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                    {scoringEvidence.clusterCohesion.medoidId && (
                      <div>
                        <strong>Medoid:</strong>{' '}
                        <code>{scoringEvidence.clusterCohesion.medoidId}</code>
                      </div>
                    )}
                  </div>
                </ScoringEvidenceCard>

                <ScoringEvidenceCard
                  title="Frequency Factor"
                  score={scoringEvidence.frequencyFactor.score}
                >
                  <div className="space-y-2">
                    <div>
                      <strong>Observed:</strong>{' '}
                      {scoringEvidence.frequencyFactor.observedCount ?? 'N/A'} occurrences
                    </div>
                    <div>
                      <strong>Min Required:</strong>{' '}
                      {scoringEvidence.frequencyFactor.minRequired ?? 'N/A'}
                    </div>
                    <div>
                      <strong>Window:</strong> {scoringEvidence.frequencyFactor.windowDays ?? 'N/A'}{' '}
                      days
                    </div>
                  </div>
                </ScoringEvidenceCard>
              </>
            )}
          </TabsContent>

          <TabsContent value="signature" className="mt-4">
            {!hasSignature ? (
              <DataUnavailable section="Signature" />
            ) : (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Hash:</div>
                  <div className="font-mono text-xs break-all">{signature.hash}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Version:</div>
                  <div>{signature.version ?? 'Unknown'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Algorithm:</div>
                  <div>{signature.algorithm ?? 'sha256'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Inputs:</div>
                  <div className="flex flex-wrap gap-1">
                    {signature.inputs.length > 0 ? (
                      signature.inputs.map((input) => (
                        <Badge key={input} variant="outline" className="text-xs">
                          {input}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-xs">No inputs recorded</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="mt-4">
            {!hasMetrics ? (
              <DataUnavailable section="Metrics" />
            ) : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Processing Time:</div>
                  <div>{metrics.processingTimeMs}ms</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Input Count:</div>
                  <div>{metrics.inputCount ?? 'N/A'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Cluster Count:</div>
                  <div>{metrics.clusterCount ?? 'N/A'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Dedup Merges:</div>
                  <div>{metrics.dedupMergeCount ?? 'N/A'}</div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t text-xs text-muted-foreground">
          <div>Created: {new Date(artifact.createdAt).toLocaleString()}</div>
          {artifact.updatedAt && (
            <div>Updated: {new Date(artifact.updatedAt).toLocaleString()}</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

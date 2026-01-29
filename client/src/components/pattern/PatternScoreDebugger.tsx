/**
 * PatternScoreDebugger
 * Sheet showing detailed evidence for pattern scoring
 */
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
import type { PatlearnArtifact } from '@/lib/schemas/api-response-schemas';

interface PatternScoreDebuggerProps {
  artifact: PatlearnArtifact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatternScoreDebugger({ artifact, open, onOpenChange }: PatternScoreDebuggerProps) {
  if (!artifact) return null;

  const { scoringEvidence, signature, metrics } = artifact;

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

        <Tabs defaultValue="scoring" className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="scoring">Scoring</TabsTrigger>
            <TabsTrigger value="signature">Signature</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="scoring" className="space-y-3 mt-4">
            <ScoringEvidenceCard
              title="Label Agreement"
              score={scoringEvidence.labelAgreement.score}
              defaultExpanded
            >
              <div className="space-y-2">
                <div>
                  <strong>Matched:</strong>{' '}
                  {scoringEvidence.labelAgreement.matchedLabels.join(', ') || 'None'}
                </div>
                <div>
                  <strong>Total Labels:</strong> {scoringEvidence.labelAgreement.totalLabels}
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
                  <code>{scoringEvidence.clusterCohesion.clusterId}</code>
                </div>
                <div>
                  <strong>Member Count:</strong> {scoringEvidence.clusterCohesion.memberCount}
                </div>
                <div>
                  <strong>Avg Pairwise Similarity:</strong>{' '}
                  {(scoringEvidence.clusterCohesion.avgPairwiseSimilarity * 100).toFixed(1)}%
                </div>
                {scoringEvidence.clusterCohesion.medoidId && (
                  <div>
                    <strong>Medoid:</strong> <code>{scoringEvidence.clusterCohesion.medoidId}</code>
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
                  <strong>Observed:</strong> {scoringEvidence.frequencyFactor.observedCount}{' '}
                  occurrences
                </div>
                <div>
                  <strong>Min Required:</strong> {scoringEvidence.frequencyFactor.minRequired}
                </div>
                <div>
                  <strong>Window:</strong> {scoringEvidence.frequencyFactor.windowDays} days
                </div>
              </div>
            </ScoringEvidenceCard>
          </TabsContent>

          <TabsContent value="signature" className="mt-4">
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Hash:</div>
                <div className="font-mono text-xs break-all">{signature.hash}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Version:</div>
                <div>{signature.version}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Algorithm:</div>
                <div>{signature.algorithm}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Inputs:</div>
                <div className="flex flex-wrap gap-1">
                  {signature.inputs.map((input, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {input}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="mt-4">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Processing Time:</div>
                <div>{metrics.processingTimeMs}ms</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Input Count:</div>
                <div>{metrics.inputCount}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Cluster Count:</div>
                <div>{metrics.clusterCount}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Dedup Merges:</div>
                <div>{metrics.dedupMergeCount}</div>
              </div>
            </div>
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

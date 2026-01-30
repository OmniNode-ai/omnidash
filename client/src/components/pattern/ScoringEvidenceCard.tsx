/**
 * ScoringEvidenceCard
 * Expandable card showing evidence for a scoring component
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Score threshold for "good" (green) - 70% and above */
const SCORE_THRESHOLD_GOOD = 0.7;
/** Score threshold for "moderate" (yellow) - 40% to 70% */
const SCORE_THRESHOLD_MODERATE = 0.4;

interface ScoringEvidenceCardProps {
  title: string;
  score: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function ScoringEvidenceCard({
  title,
  score,
  children,
  defaultExpanded = false,
}: ScoringEvidenceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const scoreColor =
    score >= SCORE_THRESHOLD_GOOD
      ? 'text-green-600'
      : score >= SCORE_THRESHOLD_MODERATE
        ? 'text-yellow-600'
        : 'text-red-600';
  const progressColor =
    score >= SCORE_THRESHOLD_GOOD
      ? 'bg-green-600'
      : score >= SCORE_THRESHOLD_MODERATE
        ? 'bg-yellow-600'
        : 'bg-red-600';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="cursor-pointer py-3 px-4" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-2 w-20 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn('h-full transition-all', progressColor)}
                style={{ width: `${score * 100}%` }}
              />
            </div>
            <span className={cn('text-sm font-mono font-semibold', scoreColor)}>
              {(score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 border-t">
          <div className="mt-3 text-sm text-muted-foreground">{children}</div>
        </CardContent>
      )}
    </Card>
  );
}

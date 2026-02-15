/**
 * SignificanceBadge
 *
 * Displays statistical significance information for A/B comparison metrics.
 * Shows p-value and confidence level, or "Not enough data" when sample
 * size is insufficient.
 *
 * @see OMN-2049 F2 - Statistical significance on A/B page
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import type { SignificanceResult } from '@/lib/statistics';
import { confidenceLevel } from '@/lib/statistics';

interface SignificanceBadgeProps {
  result: SignificanceResult;
  metric: string;
}

export function SignificanceBadge({ result, metric }: SignificanceBadgeProps) {
  const { level, colorClass } = confidenceLevel(result);

  if (!result.hasEnoughData) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="text-[10px] gap-1 text-muted-foreground border-muted cursor-help"
          >
            <HelpCircle className="w-3 h-3" />
            Not enough data
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <p className="text-xs">
            Need at least {result.minSampleSize} samples per group for {metric}.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const Icon = result.significant ? (result.pValue < 0.01 ? CheckCircle2 : AlertCircle) : XCircle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`text-[10px] gap-1 cursor-help ${colorClass}`}>
          <Icon className="w-3 h-3" />
          {result.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <div className="space-y-1">
          <p className="text-xs font-medium">{level}</p>
          <p className="text-xs text-muted-foreground">
            {result.significant
              ? `The difference in ${metric} between treatment and control is statistically significant (${result.label}).`
              : `The difference in ${metric} is not statistically significant at the 5% level (${result.label}).`}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

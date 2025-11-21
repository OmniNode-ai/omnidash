import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface SavingsTooltipProps {
  children?: React.ReactNode;
  className?: string;
}

export function SavingsTooltip({ children, className }: SavingsTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 ${className || ''}`}>
            {children || 'Potential Savings'}
            <Info className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <p className="font-semibold">How Potential Savings are Calculated:</p>
            <ul className="text-xs space-y-1">
              <li>
                • <strong>Time to refactor</strong> × Developer hourly rate × Number of occurrences
              </li>
              <li>
                • Includes <strong>estimated maintenance cost reduction</strong> over time
              </li>
              <li>• Example: 2-3 days refactor × $150-200/hr × 12 files = $25,000</li>
            </ul>
            <p className="text-xs text-muted-foreground italic mt-2">
              Note: This is an estimate based on developer time and ongoing maintenance costs
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

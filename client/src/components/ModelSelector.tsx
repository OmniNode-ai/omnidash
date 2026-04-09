import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { costSource } from '@/lib/data-sources/cost-source';
import { queryKeys } from '@/lib/query-keys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CostByModel } from '@shared/cost-types';

interface ModelSelectorProps {
  value: string | null;
  onChange: (model: string | null) => void;
  className?: string;
  /**
   * When provided, the selector uses this list of model names directly
   * instead of fetching from the cost-by-model endpoint. Useful when
   * the model list should come from a different domain (e.g. LLM routing).
   */
  models?: string[];
}

/**
 * Shared dropdown for selecting an LLM model.
 * By default fetches distinct model names from the cost-by-model endpoint.
 * Pass the `models` prop to supply an external model list instead.
 * "All Models" resets the selection to null.
 */
export const ModelSelector = memo(function ModelSelector({
  value,
  onChange,
  className,
  models: externalModels,
}: ModelSelectorProps) {
  const { data: costModels } = useQuery<CostByModel[]>({
    queryKey: queryKeys.costs.byModel(),
    queryFn: () => costSource.byModel(),
    refetchInterval: 30_000,
    enabled: externalModels === undefined,
  });

  const modelNames = externalModels ?? costModels?.map((m) => m.model_name) ?? [];

  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className={className ?? 'w-48'}>
        <SelectValue placeholder="All Models" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Models</SelectItem>
        {modelNames.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

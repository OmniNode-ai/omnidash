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
}

/**
 * Shared dropdown for selecting an LLM model.
 * Fetches distinct model names from the cost-by-model endpoint.
 * "All Models" resets the selection to null.
 */
export const ModelSelector = memo(function ModelSelector({
  value,
  onChange,
  className,
}: ModelSelectorProps) {
  const { data: models } = useQuery<CostByModel[]>({
    queryKey: queryKeys.costs.byModel(),
    queryFn: () => costSource.byModel(),
    refetchInterval: 30_000,
  });

  return (
    <Select value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className={className ?? 'w-48'}>
        <SelectValue placeholder="All Models" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Models</SelectItem>
        {models?.map((m) => (
          <SelectItem key={m.model_name} value={m.model_name}>
            {m.model_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});

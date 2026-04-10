import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

interface UseComponentDataOptions {
  queryKey: string[];
  enabled?: boolean;
  refetchInterval?: number;
}

export function useComponentData<T>(endpoint: string, options: UseComponentDataOptions) {
  return useQuery<T>({
    queryKey: options.queryKey,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${endpoint}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

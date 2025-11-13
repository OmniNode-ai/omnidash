import { describe, it, expect } from 'vitest';
import { queryClient } from '../queryClient';

describe('queryClient', () => {
  it('should be a QueryClient instance', () => {
    expect(queryClient).toBeDefined();
    expect(queryClient.getDefaultOptions).toBeDefined();
  });

  it('should have default query options configured', () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries).toBeDefined();
    expect(options.queries?.refetchOnWindowFocus).toBe(true);
    expect(options.queries?.staleTime).toBe(0);
    expect(options.queries?.retry).toBe(false);
  });

  it('should have default mutation options configured', () => {
    const options = queryClient.getDefaultOptions();
    expect(options.mutations).toBeDefined();
    expect(options.mutations?.retry).toBe(false);
  });
});


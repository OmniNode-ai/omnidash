export interface DiscoveredPattern {
  name: string;
  file_path: string;
  description?: string;
  confidence?: number;
  use_cases?: string[];
  metadata?: Record<string, any>;
}

export async function fetchPatterns(params: { path: string; lang?: string; timeout?: number }): Promise<DiscoveredPattern[]> {
  const qp = new URLSearchParams();
  qp.set('path', params.path);
  if (params.lang) qp.set('lang', params.lang);
  if (params.timeout) qp.set('timeout', String(params.timeout));

  const res = await fetch(`/api/intelligence/analysis/patterns?${qp.toString()}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Failed to fetch patterns (${res.status})`);
  }
  const json = await res.json();
  return (json?.patterns || []) as DiscoveredPattern[];
}



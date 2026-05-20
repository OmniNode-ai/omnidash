import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import McpToolsWidget from './McpToolsWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const TOOLS = [
  {
    name: 'node_sentiment_classifier',
    description: 'Classify review sentiment as positive, neutral, or negative',
    registeredAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago — NEW
    status: 'active',
    modelId: 'gemini-2.0-flash',
    correlationId: 'corr-abc-123',
  },
  {
    name: 'node_entity_extractor',
    description: 'Extract named entities from text',
    registeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    status: 'active',
    modelId: 'gemini-2.0-flash',
    correlationId: 'corr-def-456',
  },
];

describe('McpToolsWidget', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<DataSourceTestProvider client={qc}><McpToolsWidget config={{}} /></DataSourceTestProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders tool names', async () => {
    mockFetchWithItems(TOOLS);
    render(<DataSourceTestProvider client={qc}><McpToolsWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText('node_sentiment_classifier')).toBeInTheDocument();
    expect(await screen.findByText('node_entity_extractor')).toBeInTheDocument();
  });

  it('shows NEW badge for tools registered within 30 minutes', async () => {
    mockFetchWithItems(TOOLS);
    render(<DataSourceTestProvider client={qc}><McpToolsWidget config={{}} /></DataSourceTestProvider>);
    await screen.findByText('node_sentiment_classifier');
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('renders empty state when no tools registered', async () => {
    mockFetchWithItems([]);
    render(<DataSourceTestProvider client={qc}><McpToolsWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText('No MCP tools registered')).toBeInTheDocument();
  });
});

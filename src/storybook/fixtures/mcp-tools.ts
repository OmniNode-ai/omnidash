import type { McpToolRow } from '@/components/dashboard/mcp-tools/McpToolsWidget';

export interface BuildMcpToolRowsOptions {
  /** Number of rows to generate. Default 3. */
  count?: number;
  /**
   * Control whether any tools appear as NEW (registered within 30 min).
   * Default: first tool is NEW, rest are older.
   */
  includeNew?: boolean;
  /** Fixed anchor timestamp for deterministic stories. Defaults to now. */
  anchorAt?: string;
}

const TOOL_NAMES = [
  'node_sentiment_classifier',
  'node_entity_extractor',
  'node_support_summarizer',
  'node_intent_router',
  'node_code_reviewer',
];

const TOOL_DESCRIPTIONS = [
  'Classify customer review sentiment as positive, neutral, or negative with confidence score',
  'Extract named entities (person, organization, location) from news articles',
  'Summarize customer support conversations into 3 bullet points with action items',
  'Route user intent to the appropriate downstream handler node',
  'Review code changes and surface potential issues with severity ratings',
];

export function buildMcpToolRows(
  count = 3,
  opts: BuildMcpToolRowsOptions = {},
): McpToolRow[] {
  const anchor = opts.anchorAt ? new Date(opts.anchorAt).getTime() : Date.now();
  const includeNew = opts.includeNew !== false;
  const rows: McpToolRow[] = [];

  for (let i = 0; i < count; i++) {
    const isNewTool = includeNew && i === 0;
    const ageMs = isNewTool
      ? 5 * 60 * 1000       // 5 min ago — within the 30-min window
      : (i + 1) * 60 * 60 * 1000; // 1h, 2h, 3h, … ago — outside the window

    rows.push({
      name: TOOL_NAMES[i % TOOL_NAMES.length],
      description: TOOL_DESCRIPTIONS[i % TOOL_DESCRIPTIONS.length],
      registeredAt: new Date(anchor - ageMs).toISOString(),
      status: 'active',
      modelId: 'gemini-2.0-flash',
      correlationId: `demo-corr-${String(i + 1).padStart(3, '0')}`,
    });
  }

  return rows;
}

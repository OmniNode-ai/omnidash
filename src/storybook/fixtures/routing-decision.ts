import type {
  RoutingDecisionProjection,
  RoutingModel,
  RoutingIntent,
  RoutingTaskPreset,
  RoutingRule,
} from '@/components/dashboard/routing-decision/RoutingDecisionWidget';

export interface BuildRoutingDecisionOptions {
  provisioned?: boolean;
  taskCount?: number;
}

const DEFAULT_MODELS: RoutingModel[] = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B-A3B', tier: 'local', cost: 0, host: '.200' },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B-A3B', tier: 'local', cost: 0, host: '.200' },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', tier: 'local', cost: 0, host: '.201' },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', tier: 'local', cost: 0, host: '.201' },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', tier: 'cloud', cost: 0.118, host: 'cloud' },
];

const DEFAULT_INTENTS: RoutingIntent[] = [
  { id: 'code_generation', label: 'Code generation', color: 'var(--compute)' },
  { id: 'debugging', label: 'Debugging', color: 'var(--reducer)' },
  { id: 'classification', label: 'Classification', color: 'var(--orchestrator)' },
  { id: 'complex_reasoning', label: 'Complex reasoning', color: 'var(--accent)' },
  { id: 'large_context', label: 'Large context', color: 'var(--effect)' },
];

const DEFAULT_TASK_PRESETS: RoutingTaskPreset[] = [
  { id: 'palindrome', label: 'Write a palindrome checker (Python)', intent: 'code_generation', chosen: 'qwen3-coder-30b' },
  { id: 'kafka-bug', label: 'Diagnose Kafka consumer-lag in payments-svc', intent: 'debugging', chosen: 'deepseek-r1-32b' },
  { id: 'monorepo', label: 'Refactor 18-file monorepo to ESM', intent: 'large_context', chosen: 'qwen3-next-80b' },
  { id: 'intent-rule', label: 'Classify ticket type from PR description', intent: 'classification', chosen: 'deepseek-r1-14b' },
  { id: 'sec-review', label: 'Review auth flow for OWASP Top-10', intent: 'complex_reasoning', chosen: 'claude-sonnet-4-5' },
];

const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  { type: 'Classification', model: 'DeepSeek-R1-14B', cost: 0, intentId: 'classification' },
  { type: 'Code generation', model: 'Qwen3-Coder-30B', cost: 0, intentId: 'code_generation' },
  { type: 'Complex reasoning', model: 'DeepSeek-R1-32B', cost: 0, intentId: 'complex_reasoning' },
  { type: 'Large context', model: 'Qwen3-Next-80B', cost: 0, intentId: 'large_context' },
  { type: 'Fallback / hard', model: 'Claude-Sonnet-4-5', cost: 0.118, intentId: 'debugging' },
];

export function buildRoutingDecisionProjection(
  opts: BuildRoutingDecisionOptions = {},
): RoutingDecisionProjection {
  const { provisioned = true, taskCount } = opts;
  const taskPresets = taskCount !== undefined
    ? DEFAULT_TASK_PRESETS.slice(0, Math.max(1, taskCount))
    : DEFAULT_TASK_PRESETS;

  return {
    models: DEFAULT_MODELS,
    intents: DEFAULT_INTENTS,
    task_presets: taskPresets,
    routing_rules: DEFAULT_ROUTING_RULES,
    captured_at: new Date('2026-05-22T12:00:00Z').toISOString(),
    provisioned,
  };
}

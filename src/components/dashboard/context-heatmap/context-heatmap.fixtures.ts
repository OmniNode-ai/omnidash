import type { ContextExperimentScore } from './context-heatmap.types';

/**
 * OMN-11241 research results: 5-factor GLM-4.5 context ablation study.
 * golden_chain: green across all models (8/8 passed)
 * claude_md: red for local models (0/8 passed, net-negative tokens)
 * architecture_patterns: red for local models (0/8 passed)
 * exemplar: green for exact-interface tasks
 * local_failures: yellow (only helps when paired with golden_chain)
 */
export const OMN_11241_FIXTURE_SCORES: ContextExperimentScore[] = [
  // golden_chain — 8/8 pass across all 3 models
  ...(['qwen3-35b', 'qwen3-27b', 'glm-4.5'].flatMap((modelId, mi) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `golden-${modelId}-${i}`,
      modelId,
      packId: 'golden_chain',
      factorsPresent: ['golden_chain'],
      qualityGatePassed: true,
      tokensUsed: 1200 + mi * 80 + i * 30,
      taskType: 'code-generation',
      experimentRunId: 'omn-11241-run-1',
      notes: 'Exemplar chain stabilizes all paths',
      createdAt: '2026-05-10T10:00:00Z',
    }))
  )),

  // claude_md — 0/8 pass for local models (qwen3-35b, qwen3-27b), 3/8 for glm-4.5
  ...(['qwen3-35b', 'qwen3-27b'].flatMap((modelId) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `claudemd-${modelId}-${i}`,
      modelId,
      packId: 'claude_md',
      factorsPresent: ['claude_md'],
      qualityGatePassed: false,
      tokensUsed: 3200 + i * 120,
      taskType: 'code-generation',
      experimentRunId: 'omn-11241-run-1',
      notes: 'CLAUDE.md harmful for local models — net negative tokens with no quality gain',
      createdAt: '2026-05-10T10:00:00Z',
    }))
  )),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `claudemd-glm-${i}`,
    modelId: 'glm-4.5',
    packId: 'claude_md',
    factorsPresent: ['claude_md'],
    qualityGatePassed: i < 3,
    tokensUsed: 2800 + i * 100,
    taskType: 'code-generation',
    experimentRunId: 'omn-11241-run-1',
    notes: null,
    createdAt: '2026-05-10T10:00:00Z',
  })),

  // architecture_patterns — 0/8 pass for local models
  ...(['qwen3-35b', 'qwen3-27b'].flatMap((modelId) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `archpat-${modelId}-${i}`,
      modelId,
      packId: 'architecture_patterns',
      factorsPresent: ['architecture_patterns'],
      qualityGatePassed: false,
      tokensUsed: 2900 + i * 90,
      taskType: 'code-generation',
      experimentRunId: 'omn-11241-run-1',
      notes: 'Architecture patterns context harmful for local models',
      createdAt: '2026-05-10T10:00:00Z',
    }))
  )),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `archpat-glm-${i}`,
    modelId: 'glm-4.5',
    packId: 'architecture_patterns',
    factorsPresent: ['architecture_patterns'],
    qualityGatePassed: i < 4,
    tokensUsed: 2400 + i * 80,
    taskType: 'code-generation',
    experimentRunId: 'omn-11241-run-1',
    notes: null,
    createdAt: '2026-05-10T10:00:00Z',
  })),

  // exemplar — 8/8 pass for exact-interface tasks across all models
  ...(['qwen3-35b', 'qwen3-27b', 'glm-4.5'].flatMap((modelId, mi) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `exemplar-${modelId}-${i}`,
      modelId,
      packId: 'exemplar',
      factorsPresent: ['exemplar'],
      qualityGatePassed: true,
      tokensUsed: 900 + mi * 60 + i * 20,
      taskType: 'exact-interface',
      experimentRunId: 'omn-11241-run-1',
      notes: 'Exemplar context stabilizes exact-interface task type',
      createdAt: '2026-05-10T10:00:00Z',
    }))
  )),

  // local_failures — mixed, only helps when paired with golden_chain
  ...(['qwen3-35b', 'qwen3-27b', 'glm-4.5'].flatMap((modelId, mi) =>
    Array.from({ length: 8 }, (_, i) => ({
      id: `localfail-${modelId}-${i}`,
      modelId,
      packId: 'local_failures',
      factorsPresent: ['local_failures'],
      qualityGatePassed: i < 4,
      tokensUsed: 1600 + mi * 70 + i * 40,
      taskType: 'code-generation',
      experimentRunId: 'omn-11241-run-1',
      notes: 'Only helps when paired with golden_chain',
      createdAt: '2026-05-10T10:00:00Z',
    }))
  )),
];

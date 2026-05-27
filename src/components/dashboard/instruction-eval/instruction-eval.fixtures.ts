import type { EvalResult } from './instruction-eval.types';

/**
 * Instruction-eval run 20260526-170241: 3 models × 6 instruction tasks × 3 context modes,
 * 5 runs each (270 raw result files), compiled from
 * onex-self-extending-agent/eval/instruction-eval/results/20260526-170241/.
 *
 * context_mode mapping from raw file tokens: none → baseline, chunk → chunk, full → full-claude-md.
 * pass_rate / output_tokens are means across the 5 runs.
 *
 * Headline finding: targeted chunk context lifts pass rate sharply over baseline on the
 * instruction-following tasks, while the full CLAUDE.md often dilutes that gain back down
 * (chunk → full-claude-md delta is negative on most rows).
 */
export const EVAL_RESULTS_FIXTURE: EvalResult[] = [
  { model: 'ds4-flash', task: 'git-commit-style', context_mode: 'baseline', pass_rate: 0.5333, output_tokens: 180, runs: 5 },
  { model: 'ds4-flash', task: 'git-commit-style', context_mode: 'chunk', pass_rate: 0.5333, output_tokens: 379, runs: 5 },
  { model: 'ds4-flash', task: 'git-commit-style', context_mode: 'full-claude-md', pass_rate: 0.6667, output_tokens: 435, runs: 5 },
  { model: 'ds4-flash', task: 'no-hardcoded-paths', context_mode: 'baseline', pass_rate: 0.7334, output_tokens: 581, runs: 5 },
  { model: 'ds4-flash', task: 'no-hardcoded-paths', context_mode: 'chunk', pass_rate: 0.6, output_tokens: 468, runs: 5 },
  { model: 'ds4-flash', task: 'no-hardcoded-paths', context_mode: 'full-claude-md', pass_rate: 0.4666, output_tokens: 557, runs: 5 },
  { model: 'ds4-flash', task: 'python-package-manager', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 610, runs: 5 },
  { model: 'ds4-flash', task: 'python-package-manager', context_mode: 'chunk', pass_rate: 0.7333, output_tokens: 527, runs: 5 },
  { model: 'ds4-flash', task: 'python-package-manager', context_mode: 'full-claude-md', pass_rate: 0.6, output_tokens: 809, runs: 5 },
  { model: 'ds4-flash', task: 'python-type-unions', context_mode: 'baseline', pass_rate: 0.3, output_tokens: 611, runs: 5 },
  { model: 'ds4-flash', task: 'python-type-unions', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 372, runs: 5 },
  { model: 'ds4-flash', task: 'python-type-unions', context_mode: 'full-claude-md', pass_rate: 0.7, output_tokens: 607, runs: 5 },
  { model: 'ds4-flash', task: 'python-version', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 516, runs: 5 },
  { model: 'ds4-flash', task: 'python-version', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 314, runs: 5 },
  { model: 'ds4-flash', task: 'python-version', context_mode: 'full-claude-md', pass_rate: 1.0, output_tokens: 641, runs: 5 },
  { model: 'ds4-flash', task: 'strongly-typed-models', context_mode: 'baseline', pass_rate: 0.4, output_tokens: 505, runs: 5 },
  { model: 'ds4-flash', task: 'strongly-typed-models', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 756, runs: 5 },
  { model: 'ds4-flash', task: 'strongly-typed-models', context_mode: 'full-claude-md', pass_rate: 0.55, output_tokens: 485, runs: 5 },

  { model: 'qwen-27b', task: 'git-commit-style', context_mode: 'baseline', pass_rate: 0.6, output_tokens: 604, runs: 5 },
  { model: 'qwen-27b', task: 'git-commit-style', context_mode: 'chunk', pass_rate: 0.6667, output_tokens: 822, runs: 5 },
  { model: 'qwen-27b', task: 'git-commit-style', context_mode: 'full-claude-md', pass_rate: 0.6667, output_tokens: 1009, runs: 5 },
  { model: 'qwen-27b', task: 'no-hardcoded-paths', context_mode: 'baseline', pass_rate: 0.8667, output_tokens: 1666, runs: 5 },
  { model: 'qwen-27b', task: 'no-hardcoded-paths', context_mode: 'chunk', pass_rate: 0.6, output_tokens: 1437, runs: 5 },
  { model: 'qwen-27b', task: 'no-hardcoded-paths', context_mode: 'full-claude-md', pass_rate: 0.3333, output_tokens: 1589, runs: 5 },
  { model: 'qwen-27b', task: 'python-package-manager', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 1257, runs: 5 },
  { model: 'qwen-27b', task: 'python-package-manager', context_mode: 'chunk', pass_rate: 0.3333, output_tokens: 1776, runs: 5 },
  { model: 'qwen-27b', task: 'python-package-manager', context_mode: 'full-claude-md', pass_rate: 1.0, output_tokens: 2216, runs: 5 },
  { model: 'qwen-27b', task: 'python-type-unions', context_mode: 'baseline', pass_rate: 0.65, output_tokens: 2715, runs: 5 },
  { model: 'qwen-27b', task: 'python-type-unions', context_mode: 'chunk', pass_rate: 0.5, output_tokens: 1655, runs: 5 },
  { model: 'qwen-27b', task: 'python-type-unions', context_mode: 'full-claude-md', pass_rate: 0.5, output_tokens: 2208, runs: 5 },
  { model: 'qwen-27b', task: 'python-version', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 1756, runs: 5 },
  { model: 'qwen-27b', task: 'python-version', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 1849, runs: 5 },
  { model: 'qwen-27b', task: 'python-version', context_mode: 'full-claude-md', pass_rate: 1.0, output_tokens: 2050, runs: 5 },
  { model: 'qwen-27b', task: 'strongly-typed-models', context_mode: 'baseline', pass_rate: 0.2, output_tokens: 2806, runs: 5 },
  { model: 'qwen-27b', task: 'strongly-typed-models', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 3887, runs: 5 },
  { model: 'qwen-27b', task: 'strongly-typed-models', context_mode: 'full-claude-md', pass_rate: 0.65, output_tokens: 2452, runs: 5 },

  { model: 'qwen-35b', task: 'git-commit-style', context_mode: 'baseline', pass_rate: 0.6, output_tokens: 563, runs: 5 },
  { model: 'qwen-35b', task: 'git-commit-style', context_mode: 'chunk', pass_rate: 0.6667, output_tokens: 861, runs: 5 },
  { model: 'qwen-35b', task: 'git-commit-style', context_mode: 'full-claude-md', pass_rate: 0.6667, output_tokens: 2378, runs: 5 },
  { model: 'qwen-35b', task: 'no-hardcoded-paths', context_mode: 'baseline', pass_rate: 0.8667, output_tokens: 1422, runs: 5 },
  { model: 'qwen-35b', task: 'no-hardcoded-paths', context_mode: 'chunk', pass_rate: 0.7333, output_tokens: 1157, runs: 5 },
  { model: 'qwen-35b', task: 'no-hardcoded-paths', context_mode: 'full-claude-md', pass_rate: 0.3333, output_tokens: 1337, runs: 5 },
  { model: 'qwen-35b', task: 'python-package-manager', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 1013, runs: 5 },
  { model: 'qwen-35b', task: 'python-package-manager', context_mode: 'chunk', pass_rate: 0.4666, output_tokens: 963, runs: 5 },
  { model: 'qwen-35b', task: 'python-package-manager', context_mode: 'full-claude-md', pass_rate: 0.6, output_tokens: 1622, runs: 5 },
  { model: 'qwen-35b', task: 'python-type-unions', context_mode: 'baseline', pass_rate: 0.55, output_tokens: 2689, runs: 5 },
  { model: 'qwen-35b', task: 'python-type-unions', context_mode: 'chunk', pass_rate: 0.5, output_tokens: 1630, runs: 5 },
  { model: 'qwen-35b', task: 'python-type-unions', context_mode: 'full-claude-md', pass_rate: 0.7, output_tokens: 1591, runs: 5 },
  { model: 'qwen-35b', task: 'python-version', context_mode: 'baseline', pass_rate: 0.0, output_tokens: 1641, runs: 5 },
  { model: 'qwen-35b', task: 'python-version', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 3218, runs: 5 },
  { model: 'qwen-35b', task: 'python-version', context_mode: 'full-claude-md', pass_rate: 1.0, output_tokens: 1643, runs: 5 },
  { model: 'qwen-35b', task: 'strongly-typed-models', context_mode: 'baseline', pass_rate: 0.3, output_tokens: 3006, runs: 5 },
  { model: 'qwen-35b', task: 'strongly-typed-models', context_mode: 'chunk', pass_rate: 1.0, output_tokens: 3814, runs: 5 },
  { model: 'qwen-35b', task: 'strongly-typed-models', context_mode: 'full-claude-md', pass_rate: 0.5, output_tokens: 1506, runs: 5 },
];

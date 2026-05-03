// data.jsx — synthetic but realistic OmniDash data, exposed on window
// Aspirational customer-facing numbers, consistent across widgets.

const MODELS = [
  { id: "qwen3-coder-30b",   name: "Qwen3-Coder-30B-A3B",  tier: "local", cost: 0.000, latency: 1.4, tokens: 469, host: ".200" },
  { id: "qwen3-next-80b",    name: "Qwen3-Next-80B-A3B",   tier: "local", cost: 0.000, latency: 2.6, tokens: 91,  host: ".200" },
  { id: "deepseek-r1-14b",   name: "DeepSeek-R1-14B",      tier: "local", cost: 0.000, latency: 0.8, tokens: 387, host: ".201" },
  { id: "deepseek-r1-32b",   name: "DeepSeek-R1-32B",      tier: "local", cost: 0.000, latency: 7.0, tokens: 891, host: ".201" },
  { id: "glm-4-plus",        name: "GLM-4-Plus",           tier: "cloud", cost: 0.0009, latency: 8.7, tokens: 981, host: "cloud" },
  { id: "claude-sonnet-4-5", name: "Claude-Sonnet-4-5",    tier: "cloud", cost: 0.118, latency: 21.0, tokens: 17600, host: "cloud" },
];

const KPIS = {
  totalLocalSpend: 0,
  totalCloudSpend: 12.34,
  cloudAvoided: 487.62,           // aspirational
  tokensProcessed: 38_400_000,
  localPct: 0.75,
  receiptCoverage: 1.0,
  prsShipped: 712,
  rollbacks: 0,
  forgeriesCaught: 2,
  gatesPerPR: 47,
};

const TASK_PRESETS = [
  { id: "palindrome",  label: "Write a palindrome checker (Python)",          intent: "code_generation",   chosen: "qwen3-coder-30b",
    prompt: "Write a Python function `is_palindrome(s: str) -> bool` that returns True if s reads the same forwards and backwards, ignoring case, whitespace, and non-alphanumeric characters. Include docstring + 4 unit tests covering the empty string, single char, even/odd length, and a phrase with punctuation." },
  { id: "kafka-bug",   label: "Diagnose Kafka consumer-lag in payments-svc",  intent: "debugging",         chosen: "deepseek-r1-32b",
    prompt: "payments-svc consumer group `payments-v3` is reporting 4.2M message lag on topic `payments.charges.v2`. Lag started at 14:02 UTC. Attached: consumer logs (last 5min), broker metrics, recent deploys. Identify root cause and propose a fix that doesn't drop messages." },
  { id: "monorepo",    label: "Refactor 18-file monorepo to ESM",             intent: "large_context",     chosen: "qwen3-next-80b",
    prompt: "Convert this 18-file CommonJS monorepo to ESM. Update imports/exports, fix `__dirname` usage, update package.json `\"type\": \"module\"`, and migrate Jest config. Preserve all behavior. Return a unified diff." },
  { id: "intent-rule", label: "Classify ticket type from PR description",     intent: "classification",    chosen: "deepseek-r1-14b",
    prompt: "Classify this PR description into one of: bugfix | feature | refactor | docs | chore. Respond with exactly one label and a confidence score 0–1.\n\nPR: \"Fix race condition in auth middleware where concurrent requests could…\"" },
  { id: "sec-review",  label: "Review auth flow for OWASP Top-10",            intent: "complex_reasoning", chosen: "claude-sonnet-4-5",
    prompt: "Audit the attached auth flow against OWASP Top-10 (2021). For each category, state: applies / N/A, evidence (line refs), severity, and a concrete remediation. Pay particular attention to A01 (Broken Access Control), A02 (Cryptographic Failures), and A07 (Identification & Authentication Failures)." },
];

const INTENTS = [
  { id: "code_generation",   label: "Code generation",   pct: 0.41, color: "var(--compute)" },
  { id: "debugging",         label: "Debugging",         pct: 0.21, color: "var(--reducer)" },
  { id: "classification",    label: "Classification",    pct: 0.16, color: "var(--orchestrator)" },
  { id: "complex_reasoning", label: "Complex reasoning", pct: 0.12, color: "var(--accent)" },
  { id: "large_context",     label: "Large context",     pct: 0.07, color: "var(--effect)" },
  { id: "other",             label: "Other",             pct: 0.03, color: "var(--ink-3)" },
];

const RECEIPT_GATES = [
  { id: "g1", name: "Schema valid",         pass: true,  detail: "contract.yaml validates against ONEX v1.4" },
  { id: "g2", name: "Identity distinct",    pass: true,  detail: "verifier ≠ worker (caught 2 forgeries to date)" },
  { id: "g3", name: "Evidence bundle",      pass: true,  detail: "12 artifacts hash-bound to receipt" },
  { id: "g4", name: "Topic naming",         pass: true,  detail: "onex.evt.omnimarket.routed.v3" },
  { id: "g5", name: "Cost ledger entry",    pass: true,  detail: "$0.000 logged · qwen3-coder-30b" },
  { id: "g6", name: "Independent verify",   pass: true,  detail: "deepseek-r1-32b signed at 17:42:08" },
  { id: "g7", name: "Reach-in scan",        pass: true,  detail: "no cross-node imports detected" },
  { id: "g8", name: "Architecture lint",    pass: true,  detail: "compat → core → spi → infra clean" },
];

// Live event seeds — used by the bus stream component
const EVENT_TEMPLATES = [
  { type: "cmd",       node: "orchestrator", topic: "onex.cmd.omnimarket.route.v3",       text: "build_loop · ticket-4471 → market" },
  { type: "classify",  node: "compute",      topic: "onex.evt.omniintelligence.classified.v2", text: "intent=code_generation · conf 0.94" },
  { type: "route",     node: "effect",       topic: "onex.evt.omnimarket.routed.v3",      text: "→ qwen3-coder-30b · $0.000" },
  { type: "receipt",   node: "reducer",      topic: "onex.evt.receipts.signed.v1",        text: "verifier=deepseek-r1-32b · ok" },
  { type: "merge",     node: "effect",       topic: "onex.cmd.github.merge.v1",           text: "PR #4471 merged · 47 gates green" },
  { type: "projection",node: "reducer",      topic: "onex.evt.projection.updated.v1",     text: "cost_by_model · +1 row" },
  { type: "cmd",       node: "orchestrator", topic: "onex.cmd.omnimarket.route.v3",       text: "merge_sweep · 3 PRs queued" },
  { type: "classify",  node: "compute",      topic: "onex.evt.omniintelligence.classified.v2", text: "intent=debugging · conf 0.81" },
  { type: "route",     node: "effect",       topic: "onex.evt.omnimarket.routed.v3",      text: "→ deepseek-r1-32b · $0.000" },
  { type: "guard",     node: "compute",      topic: "onex.evt.immune.flagged.v1",         text: "verifier == worker · REJECTED" },
  { type: "receipt",   node: "reducer",      topic: "onex.evt.receipts.signed.v1",        text: "12 artifacts hash-bound · ok" },
  { type: "route",     node: "effect",       topic: "onex.evt.omnimarket.routed.v3",      text: "→ claude-sonnet-4-5 · $0.118" },
];

// 30 minutes of cost/min, ~1m granularity, with one big spike avoided
const COST_TREND = (() => {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const local = 0;
    // cloud cost varies — most minutes ~ 0, occasional spikes
    let cloud = 0;
    if (i === 4)  cloud = 0.118;
    if (i === 11) cloud = 0.034;
    if (i === 19) cloud = 0.092;
    if (i === 24) cloud = 0.041;
    out.push({ t: i, local, cloud, savedVsCloud: 0.41 + Math.sin(i * 0.4) * 0.06 });
  }
  return out;
})();

// Per-model savings — what each model handled, would-have-cost, p50 latency, eval accuracy
const PER_MODEL_SAVINGS = [
  { id: "qwen3-coder-30b",   name: "Qwen3-Coder-30B",   tier: "local", tasks: 412, tokensM: 14.8, spent: 0.00, wouldHaveCost: 198.40, p50: 1.4, p95: 2.9, accuracy: 0.942, color: "var(--compute)" },
  { id: "deepseek-r1-32b",   name: "DeepSeek-R1-32B",   tier: "local", tasks: 187, tokensM: 9.2,  spent: 0.00, wouldHaveCost: 142.18, p50: 7.0, p95: 12.4, accuracy: 0.918, color: "var(--reducer)" },
  { id: "qwen3-next-80b",    name: "Qwen3-Next-80B",    tier: "local", tasks: 94,  tokensM: 6.1,  spent: 0.00, wouldHaveCost: 87.55,  p50: 2.6, p95: 4.8, accuracy: 0.901, color: "var(--orchestrator)" },
  { id: "deepseek-r1-14b",   name: "DeepSeek-R1-14B",   tier: "local", tasks: 156, tokensM: 4.8,  spent: 0.00, wouldHaveCost: 41.20,  p50: 0.8, p95: 1.6, accuracy: 0.873, color: "var(--effect)" },
  { id: "claude-sonnet-4-5", name: "Claude-Sonnet-4-5", tier: "cloud", tasks: 19,  tokensM: 2.1,  spent: 8.94, wouldHaveCost: 8.94,   p50: 21.0, p95: 32.5, accuracy: 0.967, color: "var(--accent)" },
  { id: "glm-4-plus",        name: "GLM-4-Plus",        tier: "cloud", tasks: 41,  tokensM: 1.4,  spent: 3.40, wouldHaveCost: 3.40,   p50: 8.7, p95: 14.2, accuracy: 0.889, color: "var(--ink-3)" },
];

window.OD_DATA = {
  MODELS, KPIS, TASK_PRESETS, INTENTS, RECEIPT_GATES, EVENT_TEMPLATES, COST_TREND, PER_MODEL_SAVINGS,
};

-- omnidash SQLite seed script
-- Creates all tables and populates with realistic sample data for UI testing.
-- Safe to run multiple times (INSERT OR IGNORE / INSERT OR REPLACE).
-- Apply with: sqlite3 ~/.omninode/delegation/delegation.sqlite < seed-sqlite.sql

-- ── schema ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS delegation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL UNIQUE,
  session_id TEXT,
  tool_use_id TEXT,
  hook_name TEXT,
  task_type TEXT NOT NULL DEFAULT '',
  delegated_to TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  quality_gate_passed INTEGER NOT NULL DEFAULT 0,
  quality_gate_detail TEXT,
  quality_gates_checked INTEGER NOT NULL DEFAULT 0,
  quality_gates_failed INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_to_compliance INTEGER NOT NULL DEFAULT 0,
  compliance_attempts INTEGER NOT NULL DEFAULT 1,
  prompt_text TEXT,
  response_text TEXT,
  input_hash TEXT,
  input_redaction_policy TEXT NOT NULL DEFAULT 'hash_only',
  routing_rule TEXT,
  routing_confidence REAL,
  routing_candidates TEXT,
  contract_version TEXT NOT NULL DEFAULT 'v1',
  created_at REAL NOT NULL
);

-- Migration guard: add new Pydantic-written columns if absent on an older DB.
-- These statements are no-ops when CREATE TABLE above already defined them.
-- sqlite3 will print "duplicate column name" errors on fresh DBs — ignore them;
-- the shell runner (seed-sqlite.sh) suppresses those lines.
ALTER TABLE delegation_events ADD COLUMN tokens_to_compliance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delegation_events ADD COLUMN compliance_attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE delegation_events ADD COLUMN prompt_text TEXT;
ALTER TABLE delegation_events ADD COLUMN response_text TEXT;

CREATE TABLE IF NOT EXISTS llm_call_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_hash TEXT NOT NULL UNIQUE,
  correlation_id TEXT,
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER,
  estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
  latency_ms INTEGER,
  usage_source TEXT NOT NULL DEFAULT 'estimated',
  token_provenance TEXT,
  task_description TEXT,
  created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_timestamp REAL NOT NULL,
  model_local TEXT NOT NULL,
  model_cloud_baseline TEXT NOT NULL,
  local_cost_usd REAL NOT NULL DEFAULT 0.0,
  cloud_cost_usd REAL NOT NULL DEFAULT 0.0,
  savings_usd REAL NOT NULL DEFAULT 0.0,
  baseline_model TEXT NOT NULL,
  pricing_manifest_version TEXT NOT NULL DEFAULT 'v1',
  savings_method TEXT NOT NULL DEFAULT 'token_diff',
  usage_source TEXT NOT NULL DEFAULT 'estimated',
  created_at REAL NOT NULL,
  UNIQUE (session_id, event_timestamp, model_local, model_cloud_baseline)
);

CREATE TABLE IF NOT EXISTS delegation_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope TEXT NOT NULL,
  created_at REAL NOT NULL
);

-- ── migrations record ───────────────────────────────────────────────────────────

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES
  ('001_initial_schema', unixepoch() - 604800),
  ('002_add_token_fields', unixepoch() - 518400),
  ('003_add_routing_fields', unixepoch() - 432000),
  ('004_add_compliance_fields', unixepoch() - 86400);

-- ── helpers ────────────────────────────────────────────────────────────────────
-- All timestamps are Unix epoch floats (seconds).
-- "now - N days" expressed as unixepoch() - N*86400.

-- ── delegation_events (25 rows) ────────────────────────────────────────────────
-- Models: local aliases + cloud aliases
-- Task types: code_review, ticket_work, test_generation, refactor, doc_write
-- Repos: omniclaude, omnibase_infra, omnimarket, omnidash, omnibase_core

INSERT OR IGNORE INTO delegation_events
  (correlation_id, session_id, tool_use_id, hook_name, task_type, delegated_to, model_name,
   quality_gate_passed, quality_gate_detail, quality_gates_checked, quality_gates_failed,
   latency_ms, tokens_input, tokens_output, tokens_to_compliance, compliance_attempts,
   prompt_text, response_text, input_hash, input_redaction_policy,
   routing_rule, routing_confidence, routing_candidates, contract_version, created_at)
VALUES
  ('corr-001', 'sess-a1b2c3', 'tool-001', 'PreToolUse', 'code_review', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   187, 1240, 512, 8, 1,
   '[hash:a1b2c3d4]', '[hash:response-001]', 'hash:a1b2c3d4', 'hash_only',
   'task_type_match', 0.92, '["qwen3-coder-30b","deepseek-r1-14b"]', 'v1',
   unixepoch() - 7 * 86400 + 3600),

  ('corr-002', 'sess-a1b2c3', 'tool-002', 'PreToolUse', 'ticket_work', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   203, 2100, 890, 0, 1,
   '[hash:b2c3d4e5]', '[hash:response-002]', 'hash:b2c3d4e5', 'hash_only',
   'task_type_match', 0.88, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 7 * 86400 + 7200),

  ('corr-003', 'sess-d4e5f6', 'tool-003', 'PreToolUse', 'test_generation', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   341, 980, 640, 12, 2,
   '[hash:c3d4e5f6]', '[hash:response-003]', 'hash:c3d4e5f6', 'hash_only',
   'cost_optimized', 0.79, '["deepseek-r1-14b","qwen3-coder-30b"]', 'v1',
   unixepoch() - 6 * 86400 + 1800),

  ('corr-004', 'sess-d4e5f6', 'tool-004', 'PostToolUse', 'code_review', 'cloud', 'claude-sonnet-4-6',
   0, 'quality_threshold:fail', 3, 1,
   1240, 3200, 1100, 45, 3,
   '[hash:d4e5f6g7]', '[hash:response-004]', 'hash:d4e5f6g7', 'hash_only',
   'escalation', 0.65, '["claude-sonnet-4-6","gpt-4o"]', 'v1',
   unixepoch() - 6 * 86400 + 5400),

  ('corr-005', 'sess-g7h8i9', 'tool-005', 'PreToolUse', 'refactor', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   156, 1800, 720, 0, 1,
   '[hash:e5f6g7h8]', '[hash:response-005]', 'hash:e5f6g7h8', 'hash_only',
   'task_type_match', 0.95, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 6 * 86400 + 9000),

  ('corr-006', 'sess-g7h8i9', 'tool-006', 'PreToolUse', 'doc_write', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   289, 650, 1200, 0, 1,
   '[hash:f6g7h8i9]', '[hash:response-006]', 'hash:f6g7h8i9', 'hash_only',
   'cost_optimized', 0.83, '["deepseek-r1-14b"]', 'v1',
   unixepoch() - 5 * 86400 + 3600),

  ('corr-007', 'sess-j0k1l2', 'tool-007', 'PreToolUse', 'ticket_work', 'cloud', 'gpt-4o',
   1, 'deterministic:pass', 3, 0,
   890, 4100, 1600, 0, 1,
   '[hash:g7h8i9j0]', '[hash:response-007]', 'hash:g7h8i9j0', 'hash_only',
   'explicit_cloud', 0.99, '["gpt-4o"]', 'v1',
   unixepoch() - 5 * 86400 + 7200),

  ('corr-008', 'sess-j0k1l2', 'tool-008', 'PreToolUse', 'code_review', 'local', 'qwen3-coder-30b',
   1, 'sql_injection:pass', 3, 0,
   212, 1560, 480, 5, 1,
   '[hash:h8i9j0k1]', '[hash:response-008]', 'hash:h8i9j0k1', 'hash_only',
   'task_type_match', 0.91, '["qwen3-coder-30b","deepseek-r1-14b"]', 'v1',
   unixepoch() - 5 * 86400 + 10800),

  ('corr-009', 'sess-m3n4o5', 'tool-009', 'PreToolUse', 'test_generation', 'local', 'qwen3-coder-30b',
   0, 'coverage_threshold:fail', 3, 1,
   178, 2200, 900, 30, 2,
   '[hash:i9j0k1l2]', '[hash:response-009]', 'hash:i9j0k1l2', 'hash_only',
   'task_type_match', 0.87, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 4 * 86400 + 1800),

  ('corr-010', 'sess-m3n4o5', 'tool-010', 'PreToolUse', 'refactor', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   298, 1400, 560, 0, 1,
   '[hash:j0k1l2m3]', '[hash:response-010]', 'hash:j0k1l2m3', 'hash_only',
   'cost_optimized', 0.81, '["deepseek-r1-14b","qwen3-coder-30b"]', 'v1',
   unixepoch() - 4 * 86400 + 5400),

  ('corr-011', 'sess-p6q7r8', 'tool-011', 'PreToolUse', 'code_review', 'cloud', 'claude-sonnet-4-6',
   1, 'deterministic:pass', 3, 0,
   1050, 2800, 950, 0, 1,
   '[hash:k1l2m3n4]', '[hash:response-011]', 'hash:k1l2m3n4', 'hash_only',
   'escalation', 0.72, '["claude-sonnet-4-6"]', 'v1',
   unixepoch() - 4 * 86400 + 9000),

  ('corr-012', 'sess-p6q7r8', 'tool-012', 'PreToolUse', 'ticket_work', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   167, 1900, 780, 0, 1,
   '[hash:l2m3n4o5]', '[hash:response-012]', 'hash:l2m3n4o5', 'hash_only',
   'task_type_match', 0.93, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 3 * 86400 + 3600),

  ('corr-013', 'sess-s9t0u1', 'tool-013', 'PreToolUse', 'doc_write', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   321, 700, 1450, 0, 1,
   '[hash:m3n4o5p6]', '[hash:response-013]', 'hash:m3n4o5p6', 'hash_only',
   'cost_optimized', 0.86, '["deepseek-r1-14b"]', 'v1',
   unixepoch() - 3 * 86400 + 7200),

  ('corr-014', 'sess-s9t0u1', 'tool-014', 'PostToolUse', 'code_review', 'local', 'qwen3-coder-30b',
   0, 'security_check:fail', 3, 2,
   445, 3100, 1200, 62, 3,
   '[hash:n4o5p6q7]', '[hash:response-014]', 'hash:n4o5p6q7', 'hash_only',
   'task_type_match', 0.89, '["qwen3-coder-30b","claude-sonnet-4-6"]', 'v1',
   unixepoch() - 3 * 86400 + 10800),

  ('corr-015', 'sess-v2w3x4', 'tool-015', 'PreToolUse', 'test_generation', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   189, 2400, 960, 8, 1,
   '[hash:o5p6q7r8]', '[hash:response-015]', 'hash:o5p6q7r8', 'hash_only',
   'task_type_match', 0.94, '["qwen3-coder-30b","deepseek-r1-14b"]', 'v1',
   unixepoch() - 2 * 86400 + 1800),

  ('corr-016', 'sess-v2w3x4', 'tool-016', 'PreToolUse', 'refactor', 'cloud', 'gpt-4o',
   1, 'deterministic:pass', 3, 0,
   975, 3800, 1400, 0, 1,
   '[hash:p6q7r8s9]', '[hash:response-016]', 'hash:p6q7r8s9', 'hash_only',
   'explicit_cloud', 0.99, '["gpt-4o"]', 'v1',
   unixepoch() - 2 * 86400 + 5400),

  ('corr-017', 'sess-y5z6a7', 'tool-017', 'PreToolUse', 'ticket_work', 'local', 'qwen3-coder-30b',
   1, 'deterministic:pass', 3, 0,
   144, 1700, 690, 0, 1,
   '[hash:q7r8s9t0]', '[hash:response-017]', 'hash:q7r8s9t0', 'hash_only',
   'task_type_match', 0.97, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 2 * 86400 + 9000),

  ('corr-018', 'sess-y5z6a7', 'tool-018', 'PreToolUse', 'code_review', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   267, 1100, 440, 0, 1,
   '[hash:r8s9t0u1]', '[hash:response-018]', 'hash:r8s9t0u1', 'hash_only',
   'cost_optimized', 0.78, '["deepseek-r1-14b","qwen3-coder-30b"]', 'v1',
   unixepoch() - 1 * 86400 + 3600),

  ('corr-019', 'sess-b8c9d0', 'tool-019', 'PreToolUse', 'doc_write', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   308, 820, 1680, 0, 1,
   '[hash:s9t0u1v2]', '[hash:response-019]', 'hash:s9t0u1v2', 'hash_only',
   'cost_optimized', 0.84, '["deepseek-r1-14b"]', 'v1',
   unixepoch() - 1 * 86400 + 7200),

  ('corr-020', 'sess-b8c9d0', 'tool-020', 'PreToolUse', 'test_generation', 'cloud', 'claude-sonnet-4-6',
   1, 'deterministic:pass', 3, 0,
   1100, 2600, 1050, 0, 1,
   '[hash:t0u1v2w3]', '[hash:response-020]', 'hash:t0u1v2w3', 'hash_only',
   'escalation', 0.68, '["claude-sonnet-4-6","gpt-4o"]', 'v1',
   unixepoch() - 1 * 86400 + 10800),

  ('corr-021', 'sess-e1f2g3', 'tool-021', 'PreToolUse', 'code_review', 'local', 'qwen3-coder-30b',
   1, 'sql_injection:pass', 3, 0,
   198, 1380, 520, 10, 1,
   '[hash:u1v2w3x4]', '[hash:response-021]', 'hash:u1v2w3x4', 'hash_only',
   'task_type_match', 0.90, '["qwen3-coder-30b","deepseek-r1-14b"]', 'v1',
   unixepoch() - 14400),

  ('corr-022', 'sess-e1f2g3', 'tool-022', 'PreToolUse', 'ticket_work', 'local', 'qwen3-coder-30b',
   0, 'output_format:fail', 3, 1,
   234, 2500, 1100, 28, 2,
   '[hash:v2w3x4y5]', '[hash:response-022]', 'hash:v2w3x4y5', 'hash_only',
   'task_type_match', 0.88, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 10800),

  ('corr-023', 'sess-h4i5j6', 'tool-023', 'PreToolUse', 'refactor', 'local', 'deepseek-r1-14b',
   1, 'deterministic:pass', 2, 0,
   312, 1650, 660, 0, 1,
   '[hash:w3x4y5z6]', '[hash:response-023]', 'hash:w3x4y5z6', 'hash_only',
   'cost_optimized', 0.82, '["deepseek-r1-14b","qwen3-coder-30b"]', 'v1',
   unixepoch() - 7200),

  ('corr-024', 'sess-h4i5j6', 'tool-024', 'PreToolUse', 'code_review', 'cloud', 'gpt-4o',
   1, 'deterministic:pass', 3, 0,
   820, 3600, 1300, 0, 1,
   '[hash:x4y5z6a1]', '[hash:response-024]', 'hash:x4y5z6a1', 'hash_only',
   'explicit_cloud', 0.99, '["gpt-4o"]', 'v1',
   unixepoch() - 3600),

  ('corr-025', 'sess-k7l8m9', 'tool-025', 'PreToolUse', 'test_generation', 'local', 'qwen3-coder-30b',
   1, 'coverage_threshold:pass', 3, 0,
   176, 2050, 820, 5, 1,
   '[hash:y5z6a1b2]', '[hash:response-025]', 'hash:y5z6a1b2', 'hash_only',
   'task_type_match', 0.96, '["qwen3-coder-30b"]', 'v1',
   unixepoch() - 1800);

-- ── llm_call_metrics (18 rows) ─────────────────────────────────────────────────

INSERT OR IGNORE INTO llm_call_metrics
  (input_hash, correlation_id, model_id, prompt_tokens, completion_tokens, total_tokens,
   estimated_cost_usd, latency_ms, usage_source, token_provenance, task_description, created_at)
VALUES
  ('lhash-001', 'ab-sess-a1b2c3-001', 'qwen3-coder-30b', 1240, 512, 1752, 0.0088, 187, 'measured', 'api_response', 'code review omniclaude', unixepoch() - 7 * 86400 + 3600),
  ('lhash-002', 'ab-sess-a1b2c3-002', 'qwen3-coder-30b', 2100, 890, 2990, 0.0150, 203, 'measured', 'api_response', 'ticket work omnibase_infra', unixepoch() - 7 * 86400 + 7200),
  ('lhash-003', NULL, 'deepseek-r1-14b', 980, 640, 1620, 0.0065, 341, 'estimated', 'token_count', 'test generation omnimarket', unixepoch() - 6 * 86400 + 1800),
  ('lhash-004', 'ab-sess-d4e5f6-004', 'claude-sonnet-4-6', 3200, 1100, 4300, 0.0645, 1240, 'measured', 'api_response', 'code review omnibase_core', unixepoch() - 6 * 86400 + 5400),
  ('lhash-005', NULL, 'qwen3-coder-30b', 1800, 720, 2520, 0.0126, 156, 'measured', 'api_response', 'refactor omniclaude', unixepoch() - 6 * 86400 + 9000),
  ('lhash-006', NULL, 'deepseek-r1-14b', 650, 1200, 1850, 0.0074, 289, 'estimated', 'token_count', 'doc write omnimarket', unixepoch() - 5 * 86400 + 3600),
  ('lhash-007', 'ab-sess-j0k1l2-007', 'gpt-4o', 4100, 1600, 5700, 0.1140, 890, 'measured', 'api_response', 'ticket work omnidash', unixepoch() - 5 * 86400 + 7200),
  ('lhash-008', NULL, 'qwen3-coder-30b', 1560, 480, 2040, 0.0102, 212, 'measured', 'api_response', 'code review omnibase_infra', unixepoch() - 5 * 86400 + 10800),
  ('lhash-009', NULL, 'qwen3-coder-30b', 2200, 900, 3100, 0.0155, 178, 'measured', 'api_response', 'test generation omnibase_core', unixepoch() - 4 * 86400 + 1800),
  ('lhash-010', NULL, 'deepseek-r1-14b', 1400, 560, 1960, 0.0078, 298, 'estimated', 'token_count', 'refactor omnimarket', unixepoch() - 4 * 86400 + 5400),
  ('lhash-011', 'ab-sess-p6q7r8-011', 'claude-sonnet-4-6', 2800, 950, 3750, 0.0563, 1050, 'measured', 'api_response', 'code review omniclaude', unixepoch() - 4 * 86400 + 9000),
  ('lhash-012', NULL, 'qwen3-coder-30b', 1900, 780, 2680, 0.0134, 167, 'measured', 'api_response', 'ticket work omnibase_infra', unixepoch() - 3 * 86400 + 3600),
  ('lhash-013', NULL, 'deepseek-r1-14b', 700, 1450, 2150, 0.0086, 321, 'estimated', 'token_count', 'doc write omnidash', unixepoch() - 3 * 86400 + 7200),
  ('lhash-014', NULL, 'qwen3-coder-30b', 3100, 1200, 4300, 0.0215, 445, 'measured', 'api_response', 'code review omnimarket', unixepoch() - 3 * 86400 + 10800),
  ('lhash-015', NULL, 'qwen3-coder-30b', 2400, 960, 3360, 0.0168, 189, 'measured', 'api_response', 'test generation omniclaude', unixepoch() - 2 * 86400 + 1800),
  ('lhash-016', 'ab-sess-v2w3x4-016', 'gpt-4o', 3800, 1400, 5200, 0.1040, 975, 'measured', 'api_response', 'refactor omnibase_core', unixepoch() - 2 * 86400 + 5400),
  ('lhash-017', NULL, 'qwen3-coder-30b', 1700, 690, 2390, 0.0120, 144, 'measured', 'api_response', 'ticket work omnimarket', unixepoch() - 1 * 86400 + 9000),
  ('lhash-018', NULL, 'deepseek-r1-14b', 1650, 660, 2310, 0.0092, 312, 'estimated', 'token_count', 'refactor omniclaude', unixepoch() - 7200);

-- ── savings_estimates (12 rows) ────────────────────────────────────────────────
-- local_cost = qwen3/deepseek pricing; cloud_cost = claude-sonnet-4-6 baseline

INSERT OR IGNORE INTO savings_estimates
  (session_id, event_timestamp, model_local, model_cloud_baseline,
   local_cost_usd, cloud_cost_usd, savings_usd, baseline_model,
   pricing_manifest_version, savings_method, usage_source, created_at)
VALUES
  ('sess-a1b2c3', unixepoch() - 7 * 86400 + 7200, 'qwen3-coder-30b', 'claude-sonnet-4-6',
   0.0238, 0.1290, 0.1052, 'claude-sonnet-4-6', 'v2', 'token_diff', 'measured', unixepoch() - 7 * 86400 + 7200),

  ('sess-d4e5f6', unixepoch() - 6 * 86400 + 9000, 'deepseek-r1-14b', 'claude-sonnet-4-6',
   0.0139, 0.0960, 0.0821, 'claude-sonnet-4-6', 'v2', 'token_diff', 'estimated', unixepoch() - 6 * 86400 + 9000),

  ('sess-g7h8i9', unixepoch() - 5 * 86400 + 7200, 'qwen3-coder-30b', 'gpt-4o',
   0.0126, 0.1140, 0.1014, 'gpt-4o', 'v2', 'token_diff', 'measured', unixepoch() - 5 * 86400 + 7200),

  ('sess-j0k1l2', unixepoch() - 5 * 86400 + 10800, 'qwen3-coder-30b', 'claude-sonnet-4-6',
   0.0102, 0.0612, 0.0510, 'claude-sonnet-4-6', 'v2', 'token_diff', 'measured', unixepoch() - 5 * 86400 + 10800),

  ('sess-m3n4o5', unixepoch() - 4 * 86400 + 5400, 'deepseek-r1-14b', 'claude-sonnet-4-6',
   0.0078, 0.0470, 0.0392, 'claude-sonnet-4-6', 'v2', 'token_diff', 'estimated', unixepoch() - 4 * 86400 + 5400),

  ('sess-p6q7r8', unixepoch() - 3 * 86400 + 9000, 'qwen3-coder-30b', 'claude-sonnet-4-6',
   0.0230, 0.1380, 0.1150, 'claude-sonnet-4-6', 'v2', 'token_diff', 'measured', unixepoch() - 3 * 86400 + 9000),

  ('sess-s9t0u1', unixepoch() - 3 * 86400 + 10800, 'deepseek-r1-14b', 'gpt-4o',
   0.0086, 0.0860, 0.0774, 'gpt-4o', 'v2', 'token_diff', 'estimated', unixepoch() - 3 * 86400 + 10800),

  ('sess-v2w3x4', unixepoch() - 2 * 86400 + 9000, 'qwen3-coder-30b', 'gpt-4o',
   0.0168, 0.1680, 0.1512, 'gpt-4o', 'v2', 'token_diff', 'measured', unixepoch() - 2 * 86400 + 9000),

  ('sess-y5z6a7', unixepoch() - 2 * 86400 + 10800, 'deepseek-r1-14b', 'claude-sonnet-4-6',
   0.0092, 0.0552, 0.0460, 'claude-sonnet-4-6', 'v2', 'token_diff', 'estimated', unixepoch() - 2 * 86400 + 10800),

  ('sess-b8c9d0', unixepoch() - 1 * 86400 + 7200, 'qwen3-coder-30b', 'claude-sonnet-4-6',
   0.0120, 0.0720, 0.0600, 'claude-sonnet-4-6', 'v2', 'token_diff', 'measured', unixepoch() - 1 * 86400 + 7200),

  ('sess-e1f2g3', unixepoch() - 10800, 'qwen3-coder-30b', 'claude-sonnet-4-6',
   0.0138, 0.0828, 0.0690, 'claude-sonnet-4-6', 'v2', 'token_diff', 'measured', unixepoch() - 10800),

  ('sess-h4i5j6', unixepoch() - 3600, 'deepseek-r1-14b', 'gpt-4o',
   0.0092, 0.0920, 0.0828, 'gpt-4o', 'v2', 'token_diff', 'estimated', unixepoch() - 3600);

-- ── delegation_event_log (6 rows) ──────────────────────────────────────────────

INSERT INTO delegation_event_log (envelope, created_at) VALUES
  ('{"type":"ROUTING","correlation_id":"corr-025","model":"qwen3-coder-30b","task_type":"test_generation","delegated_to":"local","routing_rule":"task_type_match","confidence":0.96}',
   unixepoch() - 1800),
  ('{"type":"DECISION","correlation_id":"corr-024","model":"gpt-4o","task_type":"code_review","delegated_to":"cloud","routing_rule":"explicit_cloud","quality_gate_passed":true}',
   unixepoch() - 3600),
  ('{"type":"QUALITY_GATE","correlation_id":"corr-023","model":"deepseek-r1-14b","gate":"deterministic","passed":true,"checks_run":2}',
   unixepoch() - 7200),
  ('{"type":"ROUTING","correlation_id":"corr-022","model":"qwen3-coder-30b","task_type":"ticket_work","delegated_to":"local","routing_rule":"task_type_match","confidence":0.88}',
   unixepoch() - 10800),
  ('{"type":"QUALITY_GATE","correlation_id":"corr-022","model":"qwen3-coder-30b","gate":"output_format","passed":false,"checks_run":3,"checks_failed":1}',
   unixepoch() - 10750),
  ('{"type":"DECISION","correlation_id":"corr-021","model":"qwen3-coder-30b","task_type":"code_review","delegated_to":"local","routing_rule":"task_type_match","quality_gate_passed":true}',
   unixepoch() - 14400);

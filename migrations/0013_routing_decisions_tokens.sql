-- OMN-3449: Add token tracking columns to llm_routing_decisions
--
-- Rows inserted before Task 5 (OMN-3448) will have token columns = 0 (the DEFAULT).
-- Use AVG(NULLIF(col, 0)) at query time to exclude pre-Task-5 historical rows from
-- token averages so zeros don't drag down the numbers.
--
-- Guard: table may not exist yet on fresh installs where the collision-fix renaming
-- moved the CREATE TABLE to migration 0063. Skip safely if the table is absent.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'llm_routing_decisions'
  ) THEN
    ALTER TABLE llm_routing_decisions
      ADD COLUMN IF NOT EXISTS prompt_tokens     INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_tokens      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS omninode_enabled  BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE INDEX IF NOT EXISTS idx_lrd_tokens   ON llm_routing_decisions(total_tokens)    WHERE total_tokens > 0;
    CREATE INDEX IF NOT EXISTS idx_lrd_omninode ON llm_routing_decisions(omninode_enabled);
  END IF;
END $$;

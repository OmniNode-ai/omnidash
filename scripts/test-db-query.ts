#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Test script to query agent_actions table and understand actionType values
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Set it in .env file or export it before running this script');
  console.error('Example: export DATABASE_URL="postgresql://user:pass@host:port/db"');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function main() {
  console.log('Connecting to database...');

  // 1. Check distinct action types
  console.log('\n=== DISTINCT ACTION TYPES ===');
  const actionTypes = await db.execute(sql`
    SELECT DISTINCT action_type, COUNT(*) as count
    FROM agent_actions
    GROUP BY action_type
    ORDER BY count DESC
    LIMIT 20
  `);
  console.log(JSON.stringify(actionTypes.rows, null, 2));

  // 2. Check success/error distribution by agent
  console.log('\n=== SUCCESS/ERROR DISTRIBUTION BY AGENT ===');
  const agentStats = await db.execute(sql`
    SELECT
      agent_name,
      COUNT(*) FILTER (WHERE action_type = 'success') as success_count,
      COUNT(*) FILTER (WHERE action_type = 'error') as error_count,
      COUNT(*) FILTER (WHERE action_type = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE action_type = 'task_completed') as task_completed_count,
      COUNT(*) as total
    FROM agent_actions
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY agent_name
    ORDER BY total DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(agentStats.rows, null, 2));

  // 3. Check total unique agents
  console.log('\n=== TOTAL STATS (24h) ===');
  const totalStats = await db.execute(sql`
    SELECT
      COUNT(DISTINCT agent_name) as unique_agents,
      COUNT(*) as total_actions
    FROM agent_actions
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `);
  console.log(JSON.stringify(totalStats.rows, null, 2));

  // 4. Sample recent actions
  console.log('\n=== SAMPLE RECENT ACTIONS ===');
  const recentActions = await db.execute(sql`
    SELECT
      agent_name,
      action_type,
      action_name,
      created_at
    FROM agent_actions
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(recentActions.rows, null, 2));

  // 5. Check for quality score data
  console.log('\n=== CHECKING FOR QUALITY SCORE DATA ===');
  const qualityCheck = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'agent_actions'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(qualityCheck.rows, null, 2));

  await pool.end();
  console.log('\nDone!');
}

main().catch(console.error);

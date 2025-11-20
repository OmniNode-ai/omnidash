#!/usr/bin/env tsx
/**
 * Test script to check agent_routing_decisions table for success tracking
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

config();

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://postgres:omninode_remote_2024_secure@192.168.86.200:5436/omninode_bridge`;

const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function main() {
  console.warn('Connecting to database...');

  // 1. Check routing decisions schema
  console.warn('\n=== ROUTING DECISIONS SCHEMA ===');
  const schema = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'agent_routing_decisions'
    ORDER BY ordinal_position
  `);
  console.warn(JSON.stringify(schema.rows, null, 2));

  // 2. Check for recent routing decisions
  console.warn('\n=== RECENT ROUTING DECISIONS (24h) ===');
  const recentDecisions = await db.execute(sql`
    SELECT
      selected_agent,
      confidence_score,
      created_at
    FROM agent_routing_decisions
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.warn(JSON.stringify(recentDecisions.rows, null, 2));

  // 3. Check confidence distribution
  console.warn('\n=== CONFIDENCE DISTRIBUTION BY AGENT (7d) ===');
  const successRates = await db.execute(sql`
    SELECT
      selected_agent,
      COUNT(*) as total_requests,
      ROUND(AVG(confidence_score), 4) as avg_confidence,
      MIN(confidence_score) as min_confidence,
      MAX(confidence_score) as max_confidence
    FROM agent_routing_decisions
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY selected_agent
    ORDER BY total_requests DESC
    LIMIT 10
  `);
  console.warn(JSON.stringify(successRates.rows, null, 2));

  // 4. Check total stats
  console.warn('\n=== TOTAL ROUTING DECISIONS (7d) ===');
  const totalStats = await db.execute(sql`
    SELECT
      COUNT(*) as total_decisions,
      COUNT(DISTINCT selected_agent) as unique_agents,
      ROUND(AVG(confidence_score), 4) as avg_confidence
    FROM agent_routing_decisions
    WHERE created_at > NOW() - INTERVAL '7 days'
  `);
  console.warn(JSON.stringify(totalStats.rows, null, 2));

  await pool.end();
  console.warn('\nDone!');
}

main().catch(console.error);

import { Pool } from 'pg';

const DB_URL =
  process.env.OMNIDASH_ANALYTICS_DB_URL ||
  'postgresql://postgres:@192.168.86.201:5436/omnidash_analytics';

export const pool = new Pool({ connectionString: DB_URL });

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

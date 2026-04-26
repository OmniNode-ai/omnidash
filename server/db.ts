import { Pool } from 'pg';

const DB_URL = process.env.OMNIDASH_ANALYTICS_DB_URL;
if (!DB_URL) {
  throw new Error(
    'OMNIDASH_ANALYTICS_DB_URL is required. Set it in your environment or .env file. ' +
      'See .env.example for the expected format.',
  );
}

export const pool = new Pool({ connectionString: DB_URL });

// Without this listener, an idle-client error (network blip, server restart) crashes
// the Node process. Documented in the `pg` README. Log and swallow — callers see the
// same error on their next pool.connect() / pool.query().
pool.on('error', (err) => {
  console.error('[db] idle pg client error:', err.message);
});

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

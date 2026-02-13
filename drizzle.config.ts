import { defineConfig } from 'drizzle-kit';

// omnidash_analytics is omnidash's own read-model database (OMN-2061).
// OMNIDASH_ANALYTICS_DB_URL is the canonical connection string.
// Falls back to DATABASE_URL for backward compatibility during migration.
const dbUrl = process.env.OMNIDASH_ANALYTICS_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    'OMNIDASH_ANALYTICS_DB_URL (or DATABASE_URL) must be set. Ensure the database is provisioned.'
  );
}

export default defineConfig({
  out: './migrations',
  schema: './shared/intelligence-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
});

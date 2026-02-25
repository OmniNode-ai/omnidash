import { defineConfig } from 'drizzle-kit';

// omnidash_analytics is omnidash's own read-model database (OMN-2061).
// OMNIDASH_ANALYTICS_DB_URL is the canonical connection string.
// Falls back to DATABASE_URL for backward compatibility during migration.
const dbUrl = process.env.OMNIDASH_ANALYTICS_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    'Neither OMNIDASH_ANALYTICS_DB_URL nor DATABASE_URL is set. ' +
      'Set one of these environment variables to point at the omnidash_analytics database.'
  );
}

export default defineConfig({
  out: './migrations',
  // Only intelligence-schema.ts is included here because this Drizzle config
  // targets the omnidash_analytics database. shared/schema.ts defines tables
  // for the application database, which is managed separately.
  schema: './shared/intelligence-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
});

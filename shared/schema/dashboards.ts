import { pgTable, uuid, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import type { DashboardDefinition } from '@shared/types/dashboard';

export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    definition: jsonb('definition').notNull().$type<DashboardDefinition>(),
    author: text('author').notNull(),
    shared: boolean('shared').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dashboards_author').on(table.author),
    index('idx_dashboards_shared').on(table.shared),
    index('idx_dashboards_updated_at').on(table.updatedAt),
  ]
);

export type DashboardRow = typeof dashboards.$inferSelect;
export type InsertDashboard = typeof dashboards.$inferInsert;

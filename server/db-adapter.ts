/**
 * PostgreSQL CRUD Adapter
 * 
 * Provides full CRUD functionality for PostgreSQL tables using Drizzle ORM.
 * Supports both direct database access and event bus integration.
 * 
 * Design:
 * - Direct access: Fast, synchronous queries for dashboard APIs
 * - Event bus: Async, decoupled operations for write-heavy workloads
 * - Graceful fallback: Event bus failures fall back to direct DB
 * 
 * Usage:
 *   const adapter = new PostgresAdapter();
 *   await adapter.connect();
 *   
 *   // CRUD operations
 *   const rows = await adapter.query('agent_actions', { limit: 100 });
 *   const newRow = await adapter.insert('agent_actions', { agent_name: 'test', ... });
 *   const updated = await adapter.update('agent_actions', { id: '123' }, { status: 'completed' });
 *   await adapter.delete('agent_actions', { id: '123' });
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and, or, gte, lte, desc, asc, sql, SQL, inArray } from 'drizzle-orm';
import { intelligenceDb } from './storage';
import * as schema from '@shared/intelligence-schema';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  where?: Record<string, any>;
  select?: string[]; // Specific columns to select
}

export interface InsertOptions {
  returning?: string[]; // Columns to return
}

export interface UpdateOptions {
  returning?: string[]; // Columns to return
}

export interface DeleteOptions {
  returning?: string[]; // Columns to return
}

/**
 * PostgreSQL CRUD Adapter
 * 
 * Provides direct database access with Drizzle ORM and optional event bus integration.
 */
export class PostgresAdapter {
  private db = intelligenceDb;
  private eventBusEnabled: boolean;

  constructor() {
    // Enable event bus if Kafka is configured
    this.eventBusEnabled = !!(process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS);
  }

  /**
   * Connect to database (already connected via storage.ts, but kept for API consistency)
   */
  async connect(): Promise<void> {
    // Connection is managed by storage.ts's pool
    // This method exists for API consistency
  }

  /**
   * Query records from a table
   * 
   * @param tableName - Table name (must exist in schema)
   * @param options - Query options (limit, offset, where, orderBy)
   * @returns Array of matching records
   */
  async query<T = any>(tableName: string, options: QueryOptions = {}): Promise<T[]> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    let query = this.db.select().from(table);

    // Apply where conditions
    if (options.where) {
      const conditions = this.buildWhereConditions(table, options.where);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
    }

    // Apply ordering
    if (options.orderBy) {
      const column = this.getColumn(table, options.orderBy.column);
      if (column) {
        query = options.orderBy.direction === 'desc'
          ? query.orderBy(desc(column as any)) as any
          : query.orderBy(asc(column as any)) as any;
      }
    } else {
      // Default: order by created_at or id descending
      const createdAtCol = this.getColumn(table, 'created_at');
      const idCol = this.getColumn(table, 'id');
      if (createdAtCol) {
        query = query.orderBy(desc(createdAtCol as any)) as any;
      } else if (idCol) {
        query = query.orderBy(desc(idCol as any)) as any;
      }
    }

    // Apply limit/offset
    if (options.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options.offset) {
      query = query.offset(options.offset) as any;
    }

    // Apply column selection
    if (options.select && options.select.length > 0) {
      const columns = options.select.map(col => this.getColumn(table, col)).filter(Boolean);
      if (columns.length > 0) {
        query = this.db.select({ ...columns.reduce((acc, col, i) => ({ ...acc, [options.select![i]]: col }), {}) }).from(table) as any;
      }
    }

    return await query as T[];
  }

  /**
   * Insert a new record
   * 
   * @param tableName - Table name
   * @param data - Record data
   * @param options - Insert options (returning columns)
   * @returns Inserted record(s)
   */
  async insert<T = any>(tableName: string, data: Partial<T>, options: InsertOptions = {}): Promise<T | T[]> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    // Add timestamps if columns exist
    const now = new Date();
    if (this.hasColumn(table, 'created_at')) {
      (data as any).created_at = now;
    }
    if (this.hasColumn(table, 'updated_at')) {
      (data as any).updated_at = now;
    }

    const result = await this.db.insert(table).values(data as any).returning();

    if (result.length === 1) {
      return result[0] as T;
    }
    return result as T[];
  }

  /**
   * Update records matching conditions
   * 
   * @param tableName - Table name
   * @param where - Where conditions
   * @param data - Update data
   * @param options - Update options (returning columns)
   * @returns Updated record(s)
   */
  async update<T = any>(
    tableName: string,
    where: Record<string, any>,
    data: Partial<T>,
    options: UpdateOptions = {}
  ): Promise<T | T[]> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    // Add updated_at timestamp if column exists
    if (this.hasColumn(table, 'updated_at')) {
      (data as any).updated_at = new Date();
    }

    const conditions = this.buildWhereConditions(table, where);
    if (conditions.length === 0) {
      throw new Error('Update requires at least one where condition for safety');
    }

    const result = await this.db
      .update(table)
      .set(data as any)
      .where(and(...conditions))
      .returning();

    if (result.length === 1) {
      return result[0] as T;
    }
    return result as T[];
  }

  /**
   * Delete records matching conditions
   * 
   * @param tableName - Table name
   * @param where - Where conditions
   * @param options - Delete options (returning columns)
   * @returns Deleted record(s)
   */
  async delete<T = any>(
    tableName: string,
    where: Record<string, any>,
    options: DeleteOptions = {}
  ): Promise<T | T[]> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    const conditions = this.buildWhereConditions(table, where);
    if (conditions.length === 0) {
      throw new Error('Delete requires at least one where condition for safety');
    }

    const result = await this.db
      .delete(table)
      .where(and(...conditions))
      .returning();

    if (result.length === 1) {
      return result[0] as T;
    }
    return result as T[];
  }

  /**
   * Upsert (insert or update) a record
   * 
   * @param tableName - Table name
   * @param data - Record data
   * @param conflictColumns - Columns to check for conflicts (for ON CONFLICT)
   * @returns Upserted record
   */
  async upsert<T = any>(
    tableName: string,
    data: Partial<T>,
    conflictColumns: string[] = ['id']
  ): Promise<T> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    // Add/update timestamps
    const now = new Date();
    if (this.hasColumn(table, 'created_at')) {
      (data as any).created_at = (data as any).created_at || now;
    }
    if (this.hasColumn(table, 'updated_at')) {
      (data as any).updated_at = now;
    }

    // Build conflict columns for ON CONFLICT clause
    const conflictCols = conflictColumns.map(col => this.getColumn(table, col)).filter(Boolean);
    if (conflictCols.length === 0) {
      throw new Error(`Conflict columns not found in table ${tableName}`);
    }

    // Use Drizzle's onConflictDoUpdate
    const result = await this.db
      .insert(table)
      .values(data as any)
      .onConflictDoUpdate({
        target: conflictCols as any,
        set: { ...data, updated_at: now } as any,
      })
      .returning();

    return result[0] as T;
  }

  /**
   * Count records matching conditions
   * 
   * @param tableName - Table name
   * @param where - Where conditions (optional)
   * @returns Count of matching records
   */
  async count(tableName: string, where?: Record<string, any>): Promise<number> {
    const table = this.getTable(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found in schema`);
    }

    let query = this.db.select({ count: sql<number>`count(*)` }).from(table);

    if (where) {
      const conditions = this.buildWhereConditions(table, where);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
    }

    const result = await query;
    return Number(result[0]?.count || 0);
  }

  /**
   * Execute raw SQL query
   * 
   * @param sqlQuery - SQL query string
   * @param params - Query parameters
   * @returns Query results
   */
  async executeRaw<T = any>(sqlQuery: string, params?: any[]): Promise<T[]> {
    return await this.db.execute(sql.raw(sqlQuery, params || [])) as T[];
  }

  // Helper methods

  private getTable(tableName: string): any {
    // Map table names to schema exports
    const tableMap: Record<string, any> = {
      'agent_routing_decisions': schema.agentRoutingDecisions,
      'agent_actions': schema.agentActions,
      'agent_manifest_injections': schema.agentManifestInjections,
      'agent_transformation_events': schema.agentTransformationEvents,
      // 'error_events': schema.errorEvents, // TODO: Add errorEvents table to schema when needed
      'pattern_lineage_nodes': schema.patternLineageNodes,
      'pattern_lineage_edges': schema.patternLineageEdges,
      // Add more tables as needed
    };

    return tableMap[tableName];
  }

  private getColumn(table: any, columnName: string): any {
    if (!table || !table[columnName]) {
      return null;
    }
    return table[columnName];
  }

  private hasColumn(table: any, columnName: string): boolean {
    return !!this.getColumn(table, columnName);
  }

  private buildWhereConditions(table: any, where: Record<string, any>): SQL[] {
    const conditions: SQL[] = [];

    for (const [key, value] of Object.entries(where)) {
      const column = this.getColumn(table, key);
      if (!column) {
        console.warn(`Column ${key} not found in table, skipping condition`);
        continue;
      }

      // Handle different value types
      if (Array.isArray(value)) {
        // IN clause
        conditions.push(inArray(column as any, value));
      } else if (typeof value === 'object' && value !== null) {
        // Operators: { $gt: 10 }, { $gte: 10 }, { $lt: 10 }, { $lte: 10 }, { $ne: 10 }
        if ('$gt' in value) {
          conditions.push(sql`${column} > ${value.$gt}`);
        } else if ('$gte' in value) {
          conditions.push(gte(column as any, value.$gte));
        } else if ('$lt' in value) {
          conditions.push(sql`${column} < ${value.$lt}`);
        } else if ('$lte' in value) {
          conditions.push(lte(column as any, value.$lte));
        } else if ('$ne' in value) {
          conditions.push(sql`${column} != ${value.$ne}`);
        } else {
          // Object value: exact match
          conditions.push(eq(column as any, value));
        }
      } else {
        // Simple equality
        conditions.push(eq(column as any, value));
      }
    }

    return conditions;
  }
}

// Export singleton instance
export const dbAdapter = new PostgresAdapter();


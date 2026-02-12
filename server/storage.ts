// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
config();

import { type User, type InsertUser } from '@shared/schema';
import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
}

export const storage = new MemStorage();

// Intelligence Database Connection
// Connects to PostgreSQL database at 192.168.86.200:5436 (omninode_bridge)
// When not configured, dashboard runs in demo-only mode (graceful degradation)

// Track database configuration state for graceful degradation
let databaseConfigured = false;
let databaseConnectionError: string | null = null;

/**
 * Check if database is configured (env vars present).
 * Does NOT verify connectivity - just configuration.
 */
export function isDatabaseConfigured(): boolean {
  return databaseConfigured;
}

/**
 * Get the database configuration error message, if any.
 * Returns null if database is properly configured.
 */
export function getDatabaseError(): string | null {
  return databaseConnectionError;
}

function getIntelligenceConnectionString(): string | null {
  // Prefer DATABASE_URL if set
  if (process.env.DATABASE_URL) {
    databaseConfigured = true;
    return process.env.DATABASE_URL;
  }

  // Check for individual POSTGRES_* environment variables
  const password = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT;
  const database = process.env.POSTGRES_DATABASE;
  const user = process.env.POSTGRES_USER;

  // Graceful degradation: if not configured, return null instead of throwing
  if (!password || !host || !port || !database || !user) {
    const missing: string[] = [];
    if (!host) missing.push('POSTGRES_HOST');
    if (!port) missing.push('POSTGRES_PORT');
    if (!database) missing.push('POSTGRES_DATABASE');
    if (!user) missing.push('POSTGRES_USER');
    if (!password) missing.push('POSTGRES_PASSWORD');

    databaseConnectionError = `Database not configured. Missing: ${missing.join(', ')}. Dashboard running in demo-only mode.`;
    console.warn(`[Database] ${databaseConnectionError}`);
    databaseConfigured = false;
    return null;
  }

  databaseConfigured = true;
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

// Lazy initialization to avoid requiring env vars at module load time
let poolInstance: InstanceType<typeof Pool> | null = null;
let intelligenceDbInstance: ReturnType<typeof drizzle> | null = null;
let connectionAttempted = false;

function getPool(): InstanceType<typeof Pool> | null {
  if (!poolInstance && !connectionAttempted) {
    connectionAttempted = true;
    const connectionString = getIntelligenceConnectionString();
    if (!connectionString) {
      // Database not configured - graceful degradation
      return null;
    }
    poolInstance = new Pool({
      connectionString,
    });
  }
  return poolInstance;
}

/**
 * Get the intelligence database connection.
 * Throws if database is not configured.
 * Use isDatabaseConfigured() first to check availability for graceful degradation.
 */
export function getIntelligenceDb(): ReturnType<typeof drizzle> {
  if (!intelligenceDbInstance) {
    const pool = getPool();
    if (!pool) {
      // Database not configured - throw with helpful message
      throw new Error(
        databaseConnectionError ||
          'Database not configured. Set POSTGRES_* environment variables or DATABASE_URL.'
      );
    }
    intelligenceDbInstance = drizzle(pool);
  }
  return intelligenceDbInstance;
}

/**
 * Try to get database connection, returns null if not configured.
 * Use this for routes that want graceful degradation.
 *
 * Delegates directly to getIntelligenceDb() and catches any error
 * (including "not configured") so that the very first call can still
 * succeed when DATABASE_URL / POSTGRES_* vars are present.  Repeated
 * failures are cheap because getPool() caches via connectionAttempted.
 */
export function tryGetIntelligenceDb(): ReturnType<typeof drizzle> | null {
  try {
    return getIntelligenceDb();
  } catch {
    return null;
  }
}

/**
 * Close the intelligence database pool and reset lazy-init state.
 *
 * Intended for test teardown so integration tests that override
 * DATABASE_URL can cleanly shut down the pool they caused to be created.
 * A subsequent call to getIntelligenceDb() / tryGetIntelligenceDb() will
 * re-initialize a fresh pool from the current environment.
 */
export async function resetIntelligenceDb(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('resetIntelligenceDb() called outside test environment — ignoring');
    return;
  }
  try {
    if (poolInstance) {
      await poolInstance.end();
    }
  } finally {
    poolInstance = null;
    intelligenceDbInstance = null;
    connectionAttempted = false;
    databaseConfigured = false;
    databaseConnectionError = null;
  }
}

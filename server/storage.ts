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
// Requires DATABASE_URL or individual POSTGRES_* environment variables to be set
function getIntelligenceConnectionString(): string {
  // Prefer DATABASE_URL if set
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Otherwise, require POSTGRES_PASSWORD to be explicitly set (no hardcoded fallback)
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) {
    throw new Error(
      'Database connection requires either DATABASE_URL or POSTGRES_PASSWORD environment variable to be set. ' +
        'See .env.example for required configuration.'
    );
  }

  // Build connection string from individual environment variables
  const user = process.env.POSTGRES_USER || 'postgres';
  const host = process.env.POSTGRES_HOST || '192.168.86.200';
  const port = process.env.POSTGRES_PORT || '5436';
  const database = process.env.POSTGRES_DATABASE || 'omninode_bridge';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

const intelligenceConnectionString = getIntelligenceConnectionString();

const pool = new Pool({
  connectionString: intelligenceConnectionString,
});

export const intelligenceDb = drizzle(pool);

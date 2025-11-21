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
const intelligenceConnectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'omninode-bridge-postgres-dev-2024'}@${process.env.POSTGRES_HOST || '192.168.86.200'}:${process.env.POSTGRES_PORT || '5436'}/${process.env.POSTGRES_DATABASE || 'omninode_bridge'}`;

const pool = new Pool({
  connectionString: intelligenceConnectionString,
});

export const intelligenceDb = drizzle(pool);

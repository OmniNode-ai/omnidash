import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage, storage } from '../storage';
import type { InsertUser } from '@shared/schema';

describe('Storage', () => {
  describe('MemStorage', () => {
    let memStorage: MemStorage;

    beforeEach(() => {
      memStorage = new MemStorage();
    });

    describe('getUser', () => {
      it('should return undefined for non-existent user', async () => {
        const result = await memStorage.getUser('non-existent-id');
        expect(result).toBeUndefined();
      });

      it('should return user after creation', async () => {
        const insertUser: InsertUser = {
          username: 'testuser',
          email: 'test@example.com',
        };

        const created = await memStorage.createUser(insertUser);
        const retrieved = await memStorage.getUser(created.id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.username).toBe('testuser');
        expect(retrieved?.email).toBe('test@example.com');
      });
    });

    describe('getUserByUsername', () => {
      it('should return undefined for non-existent username', async () => {
        const result = await memStorage.getUserByUsername('non-existent');
        expect(result).toBeUndefined();
      });

      it('should return user by username', async () => {
        const insertUser: InsertUser = {
          username: 'testuser',
          email: 'test@example.com',
        };

        await memStorage.createUser(insertUser);
        const retrieved = await memStorage.getUserByUsername('testuser');

        expect(retrieved).toBeDefined();
        expect(retrieved?.username).toBe('testuser');
      });
    });

    describe('createUser', () => {
      it('should create user with generated ID', async () => {
        const insertUser: InsertUser = {
          username: 'testuser',
          email: 'test@example.com',
        };

        const created = await memStorage.createUser(insertUser);

        expect(created.id).toBeDefined();
        expect(created.username).toBe('testuser');
        expect(created.email).toBe('test@example.com');
      });

      it('should create multiple users with different IDs', async () => {
        const user1 = await memStorage.createUser({
          username: 'user1',
          email: 'user1@example.com',
        });
        const user2 = await memStorage.createUser({
          username: 'user2',
          email: 'user2@example.com',
        });

        expect(user1.id).not.toBe(user2.id);
      });
    });
  });

  describe('storage instance', () => {
    it('should be a MemStorage instance', () => {
      expect(storage).toBeInstanceOf(MemStorage);
    });
  });
});


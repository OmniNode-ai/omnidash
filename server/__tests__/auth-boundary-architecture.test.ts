import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverEntry = readFileSync(resolve(process.cwd(), 'server/index.ts'), 'utf8');

describe('server authentication boundary', () => {
  it('mounts authMiddleware as the single protected-route tenant boundary', () => {
    expect(serverEntry).not.toContain('createTenantMiddleware');
    expect(serverEntry.match(/return authMiddleware\(req, res, next\);/g)).toHaveLength(1);
  });
});

import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Artifact provenance for a real checkout or an independently hashed source archive. */
export function sourceIdentity(manifestPath = process.env.OMNIDASH_VERIFY_SOURCE_MANIFEST) {
  if (manifestPath) {
    const bytes = readFileSync(manifestPath);
    const data = JSON.parse(bytes.toString('utf8')) as { worktree_head?: unknown; files?: unknown };
    if (typeof data.worktree_head !== 'string' || !/^[a-f0-9]{40}$/.test(data.worktree_head)) throw new Error('Invalid source baseline head');
    if (!data.files || typeof data.files !== 'object' || Array.isArray(data.files) || Object.keys(data.files).length === 0) throw new Error('Source files inventory is empty or invalid');
    const root = realpathSync(process.cwd());
    const inside = (path: string) => { const name = relative(root, path); return name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name); };
    for (const [file, digest] of Object.entries(data.files)) {
      if (isAbsolute(file) || !inside(resolve(root, file))) throw new Error(`Source path outside checkout: ${file}`);
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid source hash: ${file}`);
      const path = realpathSync(file);
      if (!inside(path)) throw new Error(`Source path outside checkout: ${file}`);
      if (createHash('sha256').update(readFileSync(path)).digest('hex') !== digest) throw new Error(`Source hash mismatch: ${file}`);
    }
    return { baseSha: data.worktree_head, testedCommit: null, dirty: true,
      sourceArchive: { worktree_head: data.worktree_head, files: data.files as Record<string, string> },
      sourceManifestSha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const git = (...args: string[]) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
  const baseSha = git('rev-parse', 'HEAD').toString('utf8').trim();
  const dirty = git('status', '--porcelain').length > 0;
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').toString('utf8').split('\0').filter(Boolean);
  return { baseSha, testedCommit: dirty ? null : baseSha, dirty,
    workingDiffSha256: createHash('sha256').update(git('diff', '--binary', 'HEAD')).digest('hex'),
    untrackedFileHashes: Object.fromEntries(untracked.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])) };
}

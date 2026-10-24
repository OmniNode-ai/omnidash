import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

// The verifier's npm stage omits .git. Its original product checkout stays
// under OMNI_HOME at both the head and merge-base control. Archive runs supply
// their exact source SHA explicitly. Never label a census from the stage itself.
export function resolveCensusSourceSha(env = process.env) {
  const sha = (env.OMNIDASH_TEST_SOURCE_SHA || execFileSync('git', [
    '-C', env.OMNI_HOME ? resolve(env.OMNI_HOME, 'omnidash') : '.', 'rev-parse', 'HEAD',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Cannot determine census source SHA');
  return sha;
}

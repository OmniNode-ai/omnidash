import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPrivateEnv(path: string): Record<string, string> {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid!()
    || (metadata.mode & 0o777) !== 0o600) throw new Error('private_input_required');
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || match[1] in values || !match[2] || /[\r\0]/.test(match[2])) {
      throw new Error('invalid_private_input');
    }
    values[match[1]] = match[2];
  }
  return values;
}

/** Offline only: reuse the approved bundle, never generate credentials or start a server. */
export function prepareSimPreflightLaunch(bundle: string, outputPath: string): { status: string; keys: number } {
  const target = resolve(outputPath);
  const parent = lstatSync(dirname(target));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid!()
    || (parent.mode & 0o777) !== 0o700) throw new Error('private_output_required');
  const root = resolve(bundle);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid!()
    || (rootStat.mode & 0o777) !== 0o700) throw new Error('private_bundle_required');
  const dash = readPrivateEnv(resolve(bundle, 'omnidash.env'));
  const credentials = readPrivateEnv(resolve(bundle, 'credentials.env'));
  if (dash.KEYCLOAK_ISSUER !== 'http://auth.localhost:28080/realms/omninode'
    || dash.KEYCLOAK_CLIENT_ID !== 'omnidash') throw new Error('isolated_auth_required');
  for (const key of ['KEYCLOAK_CLIENT_SECRET', 'SESSION_SECRET']) {
    if (!/^[A-Za-z0-9._-]{16,}$/.test(dash[key] ?? '')) throw new Error('private_auth_input_required');
  }
  for (const key of ['ROLE_OMNIDASH_PASSWORD', 'VALKEY_PASSWORD']) {
    if (!/^[A-Za-z0-9._-]{16,}$/.test(credentials[key] ?? '')) throw new Error('private_database_input_required');
  }
  const values = {
    ...Object.fromEntries(['KEYCLOAK_ISSUER', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_CLIENT_SECRET', 'SESSION_SECRET']
      .map((key) => [key, dash[key]])),
    NODE_ENV: 'development', // HTTP loopback requires a non-secure session cookie.
    PORT: '3000',
    OMNIDASH_BIND_HOST: '127.0.0.1',
    OMNIDASH_BASE_URL: 'http://localhost:3000',
    OMNIDASH_DATA_SOURCE: 'postgres',
    OMNIDASH_ANALYTICS_DB_URL: `postgresql://role_omnidash:${credentials.ROLE_OMNIDASH_PASSWORD}@127.0.0.1:65036/omnidash_analytics?options=-c%20default_transaction_read_only%3Don`,
    SESSION_STORE_URL: `redis://:${credentials.VALKEY_PASSWORD}@127.0.0.1:65379/0`,
    OMNIDASH_TENANT_AUTH_MODE: 'required',
    OMNIDASH_OIDC_ISSUER_URL: dash.KEYCLOAK_ISSUER,
    OMNIDASH_OIDC_AUDIENCE: 'omnidash',
    OMNIDASH_TENANT_CLAIM: 'tenant_id',
    OMNIDASH_RUNTIME_EDGE_URL: '',
    OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED: 'false',
    OMNIDASH_ONBOARDING_ENABLED: 'false',
  };
  writeFileSync(target, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''),
    { mode: 0o600, flag: 'wx' });
  return { status: 'prepared_offline', keys: Object.keys(values).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('bundle_and_output_required');
    console.log(JSON.stringify(prepareSimPreflightLaunch(process.argv[2], process.argv[3])));
  } catch {
    console.error(JSON.stringify({ status: 'refused' }));
    process.exitCode = 1;
  }
}

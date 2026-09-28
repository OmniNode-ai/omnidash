import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { envFile } from './prove-sim-preflight-browser-login.js';
import { hasRequiredPkce } from './prove-sim-preflight-historical-graph.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKFLOW_TYPE = 'delegation-execution-graph-read';

type Cursor = { topic: string; partition: number; max_ingest_watermark: number };
type Replay = Record<string, unknown> & { correlation_id: string; nodes: unknown[]; edges: unknown[]; source_cursors: Cursor[] };
type CompletedReplay = { replay: Replay };
type ProofStage = 'inputs' | 'browser_launch' | 'authorization_redirect' | 'form_submit' | 'latest_read' | 'bounded_read' | 'unknown_read';

type LatestReadFacts = {
  acknowledgement_valid: boolean;
  submit_status: number;
  result_status: number | null;
  terminal_status: 'completed' | 'failed' | 'other' | 'none';
  refusal_code: 'not_found' | 'correlation_ambiguous' | 'ownership_denied' | 'other' | 'none';
  binding_valid: boolean;
  graph_nodes: number | null;
  graph_edges: number | null;
};

export class ProofFailure extends Error {
  constructor(readonly stage: ProofStage, readonly cause: unknown, readonly latestFacts: LatestReadFacts | null = null) { super('proof_failure'); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function sameReplay(left: Replay, right: Replay): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function acknowledgedWorkflowId(value: unknown, correlationId: string): string | null {
  if (!isRecord(value) || value.correlation_id !== correlationId || typeof value.workflow_id !== 'string' || !UUID.test(value.workflow_id)) return null;
  return value.workflow_id;
}

export function completedReplay(value: unknown, correlationId: string, workflowId: string): CompletedReplay | null {
  if (!isRecord(value) || value.workflow_id !== workflowId
    || value.workflow_type !== WORKFLOW_TYPE || value.status !== 'completed' || value.refusal !== null || !isRecord(value.result)) return null;
  const replay = value.result.replay;
  if (!isRecord(replay) || replay.correlation_id !== correlationId || !Array.isArray(replay.nodes) || !Array.isArray(replay.edges) || !Array.isArray(replay.source_cursors)) return null;
  const seen = new Set<string>();
  const cursors: Cursor[] = [];
  for (const cursor of replay.source_cursors) {
    if (!isRecord(cursor) || typeof cursor.topic !== 'string' || cursor.topic.length === 0
      || !Number.isInteger(cursor.partition) || Number(cursor.partition) < 0
      || !Number.isInteger(cursor.max_ingest_watermark) || Number(cursor.max_ingest_watermark) < 1) return null;
    const key = `${cursor.topic}\u0000${cursor.partition}`;
    if (seen.has(key)) return null;
    seen.add(key);
    cursors.push({ topic: cursor.topic, partition: Number(cursor.partition), max_ingest_watermark: Number(cursor.max_ingest_watermark) });
  }
  if (cursors.length === 0) return null;
  return { replay: replay as Replay };
}

export function isCorrelationNotFound(value: unknown, workflowId: string): boolean {
  return isRecord(value) && value.workflow_id === workflowId && value.workflow_type === WORKFLOW_TYPE && value.status === 'failed'
    && value.result === null && isRecord(value.refusal) && value.refusal.code === 'not_found';
}

function safeRefusal(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (/net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_TIMED_OUT)/.test(message)) return 'network_unavailable';
  return ['canonical_correlation_required', 'private_bundle_required', 'private_auth_input_required', 'pkce_missing', 'latest_graph_invalid', 'bounded_replay_mismatch', 'unknown_correlation_not_refused'].includes(message)
    ? message : 'proof_refused';
}

export function safeDiagnostic(error: unknown): { stage: ProofStage; refusal: string } {
  return error instanceof ProofFailure
    ? { stage: error.stage, refusal: safeRefusal(error.cause), ...(error.latestFacts ? { latest_read: error.latestFacts } : {}) }
    : { stage: 'inputs', refusal: safeRefusal(error) };
}

type BrowserWorkflowResult = { acknowledgement: unknown; terminal: unknown; submitStatus: number; resultStatus: number | null };

export function latestReadFacts(read: BrowserWorkflowResult, correlationId: string): LatestReadFacts {
  const workflowId = acknowledgedWorkflowId(read.acknowledgement, correlationId);
  const terminal = isRecord(read.terminal) ? read.terminal : null;
  const status = terminal?.status;
  const terminalStatus: LatestReadFacts['terminal_status'] = status === 'completed' || status === 'failed' ? status : terminal ? 'other' : 'none';
  const rawCode = isRecord(terminal?.refusal) ? terminal.refusal.code : undefined;
  const refusalCode: LatestReadFacts['refusal_code'] = rawCode === 'not_found' || rawCode === 'correlation_ambiguous' || rawCode === 'ownership_denied'
    ? rawCode : rawCode === undefined ? 'none' : 'other';
  const replay = isRecord(terminal?.result) && isRecord(terminal.result.replay) ? terminal.result.replay : null;
  return {
    acknowledgement_valid: workflowId !== null,
    submit_status: read.submitStatus,
    result_status: read.resultStatus,
    terminal_status: terminalStatus,
    refusal_code: refusalCode,
    binding_valid: workflowId !== null && terminal?.workflow_id === workflowId
      && (replay === null || replay.correlation_id === correlationId),
    graph_nodes: Array.isArray(replay?.nodes) ? replay.nodes.length : null,
    graph_edges: Array.isArray(replay?.edges) ? replay.edges.length : null,
  };
}

export function hasTerminalHttpSuccess(read: BrowserWorkflowResult): boolean {
  return read.submitStatus === 202 && read.resultStatus === 200;
}

async function browserRead(page: Page, correlationId: string, payload: unknown): Promise<BrowserWorkflowResult> {
  // TypeScript cannot expose Playwright's serializable page-evaluation type;
  // the browser context keeps the session cookie and never exposes its token.
  return page.evaluate(async ({ correlationId, payload }) => {
    const submit = await fetch('/api/workflow-reads', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correlation_id: correlationId, payload }),
    });
    let acknowledgement: unknown = null;
    try { acknowledgement = await submit.json(); } catch { /* validated below */ }
    if (submit.status !== 202 || typeof acknowledgement !== 'object' || acknowledgement === null) return { acknowledgement, terminal: null, submitStatus: submit.status, resultStatus: null };
    const workflowId = (acknowledgement as { workflow_id?: unknown }).workflow_id;
    if (typeof workflowId !== 'string') return { acknowledgement, terminal: null, submitStatus: submit.status, resultStatus: null };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await fetch(`/api/workflow-reads/${encodeURIComponent(workflowId)}/result`, { credentials: 'same-origin' });
      if (result.status === 409) {
        await new Promise<void>((done) => window.setTimeout(done, 500));
        continue;
      }
      let terminal: unknown = null;
      try { terminal = await result.json(); } catch { /* validated below */ }
      return { acknowledgement, terminal, submitStatus: submit.status, resultStatus: result.status };
    }
    return { acknowledgement, terminal: null, submitStatus: submit.status, resultStatus: null };
  }, { correlationId, payload });
}

export async function proveBoundedGraphRead(bundle: string, launchPath: string, correlationId: string, unknownCorrelationId: string) {
  let stage: ProofStage = 'inputs';
  let latestFacts: LatestReadFacts | null = null;
  try {
    if (!UUID.test(correlationId) || !UUID.test(unknownCorrelationId) || correlationId === unknownCorrelationId) throw new Error('canonical_correlation_required');
    const root = resolve(bundle);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o777) !== 0o700) throw new Error('private_bundle_required');
    const credentials = envFile(resolve(root, 'credentials.env'));
    const launch = envFile(launchPath);
    if (!credentials.SIM_PREFLIGHT_DEMO_USERNAME || !credentials.SIM_PREFLIGHT_DEMO_PASSWORD
      || launch.KEYCLOAK_ISSUER !== 'http://auth.localhost:28080/realms/omninode') throw new Error('private_auth_input_required');

    stage = 'browser_launch';
    const browser = await chromium.launch({ headless: true });
    try {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/', { waitUntil: 'commit' });
    stage = 'authorization_redirect';
    await page.waitForURL((url) => url.origin === 'http://auth.localhost:28080');
    if (!hasRequiredPkce(new URL(page.url()))) throw new Error('pkce_missing');
    stage = 'form_submit';
    await page.locator('#username').fill(credentials.SIM_PREFLIGHT_DEMO_USERNAME);
    await page.locator('#password').fill(credentials.SIM_PREFLIGHT_DEMO_PASSWORD);
    await page.locator('#kc-login').click();
    await page.waitForURL((url) => url.origin === 'http://localhost:3000' && url.pathname !== '/auth/callback');

    stage = 'latest_read';
    const latest = await browserRead(page, correlationId, { cursor_mode: 'latest' });
    latestFacts = latestReadFacts(latest, correlationId);
    const latestWorkflowId = acknowledgedWorkflowId(latest.acknowledgement, correlationId);
    const latestReplay = latestWorkflowId && hasTerminalHttpSuccess(latest)
      ? completedReplay(latest.terminal, correlationId, latestWorkflowId) : null;
    if (!latestReplay || latestReplay.replay.nodes.length !== 5 || latestReplay.replay.edges.length !== 4) throw new Error('latest_graph_invalid');
    const boundedPayload = { cursor_mode: 'bounded', source_cursors: latestReplay.replay.source_cursors };
    stage = 'bounded_read';
    const firstRead = await browserRead(page, correlationId, boundedPayload);
    const firstWorkflowId = acknowledgedWorkflowId(firstRead.acknowledgement, correlationId);
    const firstBounded = firstWorkflowId && hasTerminalHttpSuccess(firstRead)
      ? completedReplay(firstRead.terminal, correlationId, firstWorkflowId) : null;
    const secondRead = await browserRead(page, correlationId, boundedPayload);
    const secondWorkflowId = acknowledgedWorkflowId(secondRead.acknowledgement, correlationId);
    const secondBounded = secondWorkflowId && hasTerminalHttpSuccess(secondRead)
      ? completedReplay(secondRead.terminal, correlationId, secondWorkflowId) : null;
    if (!firstBounded || !secondBounded
      || !sameReplay(latestReplay.replay, firstBounded.replay)
      || !sameReplay(firstBounded.replay, secondBounded.replay)) throw new Error('bounded_replay_mismatch');
    stage = 'unknown_read';
    const unknown = await browserRead(page, unknownCorrelationId, { cursor_mode: 'latest' });
    const unknownWorkflowId = acknowledgedWorkflowId(unknown.acknowledgement, unknownCorrelationId);
    if (!unknownWorkflowId || !hasTerminalHttpSuccess(unknown) || !isCorrelationNotFound(unknown.terminal, unknownWorkflowId)) throw new Error('unknown_correlation_not_refused');
    return { pkce: true, latest_graph: true, bounded_replay_equal: true, unknown_not_found_refusal: true };
    } finally { await browser.close(); }
  } catch (error) {
    throw new ProofFailure(stage, error, stage === 'latest_read' ? latestFacts : null);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  proveBoundedGraphRead(process.argv[2] ?? '', process.argv[3] ?? '', process.argv[4] ?? '', process.argv[5] ?? '').then(
    (result) => console.log(JSON.stringify(result)),
    (error: unknown) => { console.error(JSON.stringify(safeDiagnostic(error))); process.exitCode = 1; },
  );
}

import { existsSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { envFile } from './prove-sim-preflight-browser-login.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKFLOW_TYPE = 'delegation-execution-graph-read';

export function acknowledgedWorkflowId(value: unknown, correlationId: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const acknowledgement = value as { workflow_id?: unknown; correlation_id?: unknown };
  return typeof acknowledgement.workflow_id === 'string' && UUID.test(acknowledgement.workflow_id)
    && acknowledgement.correlation_id === correlationId ? acknowledgement.workflow_id : null;
}

export function graphCounts(value: unknown, correlationId: string, workflowId: string): { nodes: number; edges: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const terminal = value as { workflow_id?: unknown; workflow_type?: unknown; status?: unknown; refusal?: unknown; result?: unknown };
  if (terminal.workflow_id !== workflowId || terminal.workflow_type !== WORKFLOW_TYPE || terminal.status !== 'completed' || terminal.refusal !== null) return null;
  const result = terminal.result;
  if (typeof result !== 'object' || result === null) return null;
  const replay = (result as { replay?: unknown }).replay;
  if (typeof replay !== 'object' || replay === null) return null;
  const { correlation_id, nodes, edges } = replay as { correlation_id?: unknown; nodes?: unknown; edges?: unknown };
  if (correlation_id !== correlationId) return null;
  return Array.isArray(nodes) && Array.isArray(edges) ? { nodes: nodes.length, edges: edges.length } : null;
}

export function hasRecordedEvidence(counts: { nodes: number; edges: number }): boolean {
  return counts.nodes > 0 || counts.edges > 0;
}

export function exactCountsMatch(actual: { nodes: number; edges: number }, expected: { nodes: number; edges: number }): boolean {
  return actual.nodes === expected.nodes && actual.edges === expected.edges;
}

export function parseExpectedCount(value: string): number | null {
  return /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : null;
}

export function hasRequiredPkce(url: URL): boolean {
  return url.origin === 'http://auth.localhost:28080'
    && url.pathname === '/realms/omninode/protocol/openid-connect/auth'
    && url.searchParams.get('client_id') === 'omnidash'
    && url.searchParams.get('redirect_uri') === 'http://localhost:3000/auth/callback'
    && url.searchParams.get('scope') === 'openid tenant'
    && url.searchParams.get('code_challenge_method') === 'S256'
    && Boolean(url.searchParams.get('code_challenge'))
    && Boolean(url.searchParams.get('state'))
    && Boolean(url.searchParams.get('nonce'));
}

/** Real browser proof only: no fixtures, state injection, or token receipt access. */
export async function proveHistoricalGraph(
  bundle: string,
  launchPath: string,
  correlationId: string,
  screenshotPath: string,
  expectedNodes: string,
  expectedEdges: string,
) {
  if (!UUID.test(correlationId)) throw new Error('invalid_correlation');
  const nodes = parseExpectedCount(expectedNodes);
  const edges = parseExpectedCount(expectedEdges);
  if (nodes === null || edges === null || (nodes === 0 && edges === 0)) throw new Error('expected_counts_required');
  const expectedCounts = { nodes, edges };
  const root = resolve(bundle);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o777) !== 0o700) throw new Error('private_bundle_required');
  const credentials = envFile(resolve(root, 'credentials.env'));
  const launch = envFile(launchPath);
  if (!credentials.SIM_PREFLIGHT_DEMO_USERNAME || !credentials.SIM_PREFLIGHT_DEMO_PASSWORD
    || launch.KEYCLOAK_ISSUER !== 'http://auth.localhost:28080/realms/omninode') throw new Error('private_auth_input_required');
  if (existsSync(screenshotPath)) throw new Error('evidence_exists');
  const parent = dirname(resolve(screenshotPath));
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('evidence_path_required');

  const browser = await chromium.launch({ headless: true });
  let stage = 'authorization';
  const page = await browser.newPage({ viewport: { width: 2400, height: 1400 } });
  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'commit' });
    await page.waitForURL((url) => url.origin === 'http://auth.localhost:28080');
    const auth = new URL(page.url());
    if (!hasRequiredPkce(auth)) throw new Error('pkce_missing');
    await page.locator('#username').fill(credentials.SIM_PREFLIGHT_DEMO_USERNAME);
    await page.locator('#password').fill(credentials.SIM_PREFLIGHT_DEMO_PASSWORD);
    await page.locator('#kc-login').click();
    await page.waitForURL((url) => url.origin === 'http://localhost:3000' && url.pathname !== '/auth/callback');
    stage = 'live_source';
    if (await page.getByTestId('data-source-control-trigger').getAttribute('data-mode') !== 'live') throw new Error('live_data_source_required');
    // This deliberately follows the operator UI path; it neither preloads a
    // dashboard layout nor reaches into application state.
    stage = 'add_widget';
    await page.getByRole('button', { name: 'Add Widget', exact: true }).click();
    stage = 'widget_library';
    await page.locator('.library .lib-card').filter({ hasText: 'Delegation Control Plane' }).click();
    // The desktop library overlays the header Save button. Its visible Close
    // control invokes DashboardView.handleSave and preserves the added widget.
    stage = 'widget_save';
    await page.getByRole('button', { name: 'Close library', exact: true }).click();
    stage = 'trace_tab';
    await page.locator('.widget').filter({ hasText: 'Delegation Control Plane' }).waitFor();
    await page.getByRole('tab', { name: 'Correlation Trace', exact: true }).click();
    await page.getByLabel('Historical correlation ID').fill(correlationId);
    stage = 'graph_read';
    const acknowledgementResponse = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return response.request().method() === 'POST' && response.status() === 202
          && url.origin === 'http://localhost:3000'
          && url.pathname === '/api/workflow-reads';
      } catch { return false; }
    }, { timeout: 15_000 });
    // Register before submit so a fast workflow result cannot race the
    // acknowledgement parser. Its workflow path is bound after the ack.
    const resultResponse = page.waitForResponse((response) => {
      try {
        const url = new URL(response.url());
        return response.request().method() === 'GET' && response.status() === 200 && url.origin === 'http://localhost:3000'
          && /^\/api\/workflow-reads\/[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\/result$/i.test(url.pathname);
      } catch { return false; }
    }, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Open historical graph' }).click();
    const workflowId = acknowledgedWorkflowId(await (await acknowledgementResponse).json().catch(() => null), correlationId);
    if (!workflowId) throw new Error('graph_acknowledgement_invalid');
    const result = await resultResponse;
    if (new URL(result.url()).pathname !== `/api/workflow-reads/${workflowId}/result`) throw new Error('graph_workflow_binding_invalid');
    const counts = graphCounts(await result.json().catch(() => null), correlationId, workflowId);
    stage = 'graph_response_validation';
    if (!counts) throw new Error('graph_response_missing');
    if (!hasRecordedEvidence(counts)) throw new Error('empty_graph');
    if (!exactCountsMatch(counts, expectedCounts)) throw new Error('graph_count_mismatch');
    const expected = `${counts.nodes} recorded nodes, ${counts.edges} recorded edges`;
    const summary = page.getByText(expected, { exact: true });
    const graph = page.getByRole('group', { name: 'Recorded delegation execution graph', exact: true });
    stage = 'graph_render';
    // The terminal response precedes React's render. Wait for both proof
    // surfaces before inspecting them so a valid render cannot fail on a tick.
    await Promise.all([summary.waitFor(), graph.waitFor()]);
    if (!await summary.isVisible()) throw new Error('graph_dom_mismatch');
    const renderedNodes = await graph.locator('.execution-graph-node').count();
    const renderedEdges = await graph.locator('path[data-edge-kind]').count();
    if (!exactCountsMatch({ nodes: renderedNodes, edges: renderedEdges }, expectedCounts)) throw new Error('graph_dom_mismatch');
    await graph.screenshot({ path: screenshotPath });
    return { authenticated: true, authorized_graph: true, dom_counts_match: true, screenshot_saved: true };
  } catch (error) {
    const diagnosticPath = `${screenshotPath}.diagnostic-not-proof-${stage}.png`;
    // Diagnostic captures are explicitly non-proof artifacts; only the graph
    // element capture above is admissible rendered evidence.
    if (stage !== 'authorization' && new URL(page.url()).origin === 'http://localhost:3000' && !existsSync(diagnosticPath)) {
      await page.screenshot({ path: diagnosticPath, fullPage: true });
    }
    console.error(JSON.stringify({ stage, refusal: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'proof_refused' }));
    throw error;
  } finally { await browser.close(); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  proveHistoricalGraph(
    process.argv[2] ?? '', process.argv[3] ?? '', process.argv[4] ?? '', process.argv[5] ?? '', process.argv[6] ?? '', process.argv[7] ?? '',
  ).then(
    (result) => console.log(JSON.stringify(result)),
    () => {
      // Never expose browser URLs, request bodies, credentials, or response data.
      console.error(JSON.stringify({ stage: 'historical_graph_proof', refusal: 'proof_refused' }));
      process.exitCode = 1;
    },
  );
}

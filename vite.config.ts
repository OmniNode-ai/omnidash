import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadDataSourceConfig } from './server/data-source-contract.js';

const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `next` is part of the Connect middleware contract but neither of our
 * handlers calls it (each request resolves with res.end()). Typed for
 * clarity rather than borrowed from `connect` to avoid pulling another
 * type-only dep just for this signature.
 */
type ConnectNext = (err?: unknown) => void;

export function fixturesMiddleware(opts: { root: string; dataSource?: string }) {
  const root = opts.root;

  // OMN-10756: resolve data source mode from contract.yaml defaults.
  // opts.dataSource (if provided) and OMNIDASH_DATA_SOURCE env are optional overrides.
  const dsConfig = loadDataSourceConfig();
  const dataSource = opts.dataSource ?? dsConfig.mode;
  let sqliteDb: any = null;
  if (dataSource === 'sqlite') {
    try {
      const Database = _require('better-sqlite3');
      const dbPath = dsConfig.sqliteDbPath;
      if (existsSync(dbPath)) {
        sqliteDb = new Database(dbPath, { readonly: true, fileMustExist: true });
      }
    } catch (e) {
      console.error('[sqlite-init]', e);
    }
  }

  const sqliteCache = new Map<string, unknown[]>();

  function querySqlite(topic: string): unknown[] | null {
    if (!sqliteDb) return null;
    try {
      if (topic === 'onex.snapshot.projection.delegation.savings.v1') {
        const OPUS_INPUT = 15.0 / 1_000_000;
        const OPUS_OUTPUT = 75.0 / 1_000_000;
        const sessions = sqliteDb.prepare(`
          SELECT correlation_id as session_id, task_type, model_name,
                 delegation_latency_ms as latency_ms, tokens_to_compliance,
                 cost_savings_usd, created_at, prompt_text, response_text
          FROM delegation_events
          ORDER BY created_at DESC LIMIT 100
        `).all().map((r: any) => {
          const pt = Math.round((r.tokens_to_compliance || 0) * 0.1);
          const ct = Math.max(0, (r.tokens_to_compliance || 0) - pt);
          const cloud = pt * OPUS_INPUT + ct * OPUS_OUTPUT;
          return {
            session_id: r.session_id,
            local_cost_usd: 0,
            cloud_cost_usd: cloud,
            savings_usd: cloud,
            baseline_model: 'claude-opus-4-6',
            pricing_manifest_version: '2026-05-12',
            savings_method: 'estimated' as const,
            usage_source: 'measured' as const,
            created_at: new Date((r.created_at || 0) * 1000).toISOString(),
            task_type: r.task_type || undefined,
            model_name: r.model_name || undefined,
            latency_ms: r.latency_ms || undefined,
            prompt_tokens: pt || undefined,
            completion_tokens: ct || undefined,
            prompt_text: r.prompt_text || undefined,
            response_text: r.response_text || undefined,
          };
        });
        const total = sessions.reduce((s: number, r: any) => s + r.savings_usd, 0);
        const totalCloud = sessions.reduce((s: number, r: any) => s + r.cloud_cost_usd, 0);
        return [{
          cumulative_savings_usd: total,
          cumulative_local_cost_usd: 0,
          cumulative_cloud_cost_usd: totalCloud,
          baseline_model: 'claude-opus-4-6',
          pricing_manifest_version: '2026-05-12',
          session_count: sessions.length,
          sessions,
          captured_at: new Date().toISOString(),
          provisioned: true,
        }];
      }
      if (topic === 'onex.snapshot.projection.delegation.model-routing.v1') {
        const rows = sqliteDb.prepare('SELECT model_name, task_type, COUNT(*) as count FROM delegation_events GROUP BY model_name, task_type ORDER BY count DESC').all() as any[];
        const modelStats = sqliteDb.prepare(`
          SELECT model_name, COUNT(*) as total, AVG(latency_ms) as avg_latency_ms,
                 CAST(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as qg_pass_rate,
                 GROUP_CONCAT(DISTINCT task_type) as task_types,
                 (SELECT task_type FROM delegation_events d2 WHERE d2.model_name = delegation_events.model_name GROUP BY task_type ORDER BY COUNT(*) DESC LIMIT 1) as top_task_type
          FROM delegation_events GROUP BY model_name
        `).all() as any[];
        const totalAll = rows.reduce((s: number, r: any) => s + r.count, 0);
        const statsMap: Record<string, any> = {};
        for (const ms of modelStats) statsMap[ms.model_name] = ms;
        const byModel = modelStats.map((ms: any) => ({
          model_name: ms.model_name, total_count: ms.total,
          pct_of_total: totalAll > 0 ? ms.total / totalAll : 0,
          top_task_type: ms.top_task_type || '',
          avg_latency_ms: Math.round(ms.avg_latency_ms || 0),
          qg_pass_rate: ms.qg_pass_rate ?? 1,
          task_types: (ms.task_types || '').split(',').filter(Boolean),
        }));
        const detailRows = rows.map((r: any) => {
          const ms = statsMap[r.model_name];
          const modelTotal = ms?.total || 1;
          return { model_name: r.model_name, task_type: r.task_type, count: r.count, pct_of_model: r.count / modelTotal, pct_of_total: totalAll > 0 ? r.count / totalAll : 0 };
        });
        return [{ total_delegations: totalAll, rows: detailRows, by_model: byModel, captured_at: new Date().toISOString(), provisioned: true }];
      }
      if (topic === 'onex.snapshot.projection.delegation.quality-gate.v1') {
        const agg = sqliteDb.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) as passed, SUM(CASE WHEN quality_gate_passed THEN 0 ELSE 1 END) as failed FROM delegation_events').get() as any;
        const passRate = agg.total > 0 ? agg.passed / agg.total : 0;
        const byCheckType = sqliteDb.prepare(`
          SELECT COALESCE(SUBSTR(quality_gate_detail, 1, INSTR(quality_gate_detail || ':', ':') - 1), 'unknown') as check_type,
                 SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) as passed,
                 SUM(CASE WHEN quality_gate_passed THEN 0 ELSE 1 END) as failed,
                 CAST(SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as pass_rate
          FROM delegation_events GROUP BY check_type
        `).all() as any[];
        const failedEvents = sqliteDb.prepare("SELECT quality_gate_detail FROM delegation_events WHERE NOT quality_gate_passed LIMIT 20").all() as any[];
        const failCategories = [...new Set(failedEvents.map((e: any) => e.quality_gate_detail).filter(Boolean))];
        return [{ overall_pass_rate: passRate, total_passed: agg.passed, total_failed: agg.failed, total_checks: agg.total, escalation_count: agg.failed, escalation_rate: agg.total > 0 ? agg.failed / agg.total : 0, by_check_type: byCheckType.length > 0 ? byCheckType : [{ check_type: 'deterministic', passed: agg.passed, failed: agg.failed, pass_rate: passRate }], failure_categories: failCategories, captured_at: new Date().toISOString(), provisioned: true }];
      }
      if (topic === 'onex.snapshot.projection.delegation.token-usage.v1') {
        const rows = sqliteDb.prepare(`
          SELECT model_id as model_name,
                 SUM(prompt_tokens) as prompt_tokens,
                 SUM(completion_tokens) as completion_tokens,
                 SUM(prompt_tokens + completion_tokens) as total_tokens,
                 COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd
          FROM llm_call_metrics GROUP BY model_id
        `).all() as any[];
        const provenanceCounts = sqliteDb.prepare(`
          SELECT COALESCE(token_provenance, 'unknown') as prov,
                 SUM(prompt_tokens + completion_tokens) as tokens
          FROM llm_call_metrics GROUP BY prov
        `).all() as any[];
        const totalPrompt = rows.reduce((s: number, r: any) => s + r.prompt_tokens, 0);
        const totalCompletion = rows.reduce((s: number, r: any) => s + r.completion_tokens, 0);
        const totalCost = rows.reduce((s: number, r: any) => s + r.estimated_cost_usd, 0);
        const provSummary: Record<string, number> = { measured: 0, estimated: 0, unknown: 0 };
        for (const p of provenanceCounts) {
          const key = p.prov === 'measured' ? 'measured' : p.prov === 'estimated' ? 'estimated' : 'unknown';
          provSummary[key] += p.tokens;
        }
        return [{ total_prompt_tokens: totalPrompt, total_completion_tokens: totalCompletion, total_tokens: totalPrompt + totalCompletion, total_estimated_cost_usd: totalCost, provenance_summary: provSummary, by_model: rows, captured_at: new Date().toISOString(), provisioned: true }];
      }
      if (topic === 'onex.snapshot.projection.delegation.summary.v1') {
        const agg = sqliteDb.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) as passed FROM delegation_events').get() as any;
        const byTask = sqliteDb.prepare('SELECT task_type as taskType, COUNT(*) as count FROM delegation_events GROUP BY task_type').all();
        const byModel = sqliteDb.prepare('SELECT model_name as model, COUNT(*) as count FROM delegation_events GROUP BY model_name').all();
        const savings = sqliteDb.prepare('SELECT COALESCE(SUM(savings_usd), 0) as total FROM savings_estimates').get() as any;
        return [{ totalDelegations: agg.total, qualityGatePassRate: agg.total > 0 ? agg.passed / agg.total : 0, qualityGatePassed: agg.passed, qualityGateTotal: agg.total, totalSavingsUsd: savings.total, byTaskType: byTask, byModel: byModel }];
      }
      if (topic === 'onex.snapshot.projection.delegation.decisions.v1') {
        return sqliteDb.prepare('SELECT * FROM delegation_events ORDER BY created_at DESC LIMIT 100').all();
      }
      if (topic === 'onex.snapshot.projection.llm_cost.v1') {
        return sqliteDb.prepare('SELECT * FROM llm_call_metrics ORDER BY created_at DESC LIMIT 100').all();
      }
    } catch (e) { console.error('[sqlite-query]', topic, e); }
    return null;
  }

  const handler = (req: IncomingMessage, res: ServerResponse, _next: ConnectNext) => {
    // NOTE: req.url arrives WITHOUT the /_fixtures prefix (Vite strips it).
    const urlPath = (req.url ?? '').split('?')[0];
    if (sqliteDb) console.log('[sqlite-fixtures]', req.method, urlPath);
    const parts = urlPath.split('/').filter(Boolean);

    if (parts.length === 1 && parts[0] === 'registry.json') {
      const file = path.join(root, 'registry.json');
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    if (parts.length === 2 && parts[1] === 'index.json') {
      const topic = decodeURIComponent(parts[0]!);
      const sqliteRows = querySqlite(topic);
      if (sqliteRows !== null) {
        sqliteCache.set(topic, sqliteRows);
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(sqliteRows.map((_: unknown, i: number) => `${i}.json`)));
      }

      const dir = path.join(root, parts[0]!);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) { res.statusCode = 404; return res.end(); }
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(files));
    }

    if (parts.length === 2 && parts[1]!.endsWith('.json')) {
      const topic = decodeURIComponent(parts[0]!);
      const idx = parseInt(parts[1]!, 10);
      const cached = sqliteCache.get(topic);
      if (cached && !isNaN(idx) && idx < cached.length) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(cached[idx]));
      }

      const file = path.join(root, parts[0]!, parts[1]!);
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    res.statusCode = 404;
    return res.end();
  };

  const projectionHandler = (req: IncomingMessage, res: ServerResponse, _next: ConnectNext) => {
    const topic = decodeURIComponent((req.url ?? '/').replace(/^\//, '').replace(/\/$/, ''));
    if (!topic) { res.statusCode = 404; return res.end(); }
    const rows = querySqlite(topic);
    if (rows !== null) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(rows));
    }
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'topic not found', topic }));
  };

  const plugin = {
    name: 'fixtures-middleware',
    configureServer(server: any) {
      server.middlewares.use('/_fixtures', handler);
      server.middlewares.use('/projection', projectionHandler);
    },
  };

  return { plugin, handler };
}

export function layoutsMiddleware(opts: { root: string }) {
  const root = opts.root;
  const handler = (req: IncomingMessage, res: ServerResponse, _next: ConnectNext) => {
    // NOTE: req.url arrives WITHOUT the /_layouts prefix (Vite strips it).
    const urlPath = (req.url ?? '').split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);

    // Only handle single-segment paths: /<name>
    if (parts.length !== 1) {
      res.statusCode = 404;
      return res.end();
    }

    const name = parts[0]!;
    // Guard against path traversal: reject names containing path separators or dot-only segments.
    if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
      res.statusCode = 400;
      return res.end();
    }
    const file = path.join(root, `${name}.json`);

    if (req.method === 'GET') {
      if (!existsSync(file)) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(readFileSync(file));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          // Validate JSON before writing
          JSON.parse(body);
          mkdirSync(root, { recursive: true });
          writeFileSync(file, body, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(body);
        } catch (_err) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });
      return;
    }

    res.statusCode = 404;
    return res.end();
  };

  const plugin = {
    name: 'layouts-middleware',
    configureServer(server: any) {
      server.middlewares.use('/_layouts', handler);
    },
  };

  return { plugin, handler };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // OMN-10756: dataSource defaults come from contract.yaml via loadDataSourceConfig().
  // OMNIDASH_DATA_SOURCE env is an optional override; pass it only when explicitly set.
  const { plugin: fixturesPlugin } = fixturesMiddleware({
    root: path.resolve(__dirname, 'fixtures'),
    dataSource: env.OMNIDASH_DATA_SOURCE || undefined,
  });
  const { plugin: layoutsPlugin } = layoutsMiddleware({
    root: path.resolve(__dirname, 'dashboard-layouts'),
  });
  return {
    plugins: [react(), vanillaExtractPlugin(), fixturesPlugin, layoutsPlugin],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    build: {
      rollupOptions: {
        // better-sqlite3 is a server-side native N-API module. It must never
        // be bundled by Vite — only server/routes.ts uses it at runtime.
        external: ['better-sqlite3'],
      },
    },
    optimizeDeps: {
      exclude: ['better-sqlite3'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 3001),
      proxy: env.VITE_LLM_BASE_URL
        ? {
            // Routes /llm-proxy/* → LLM host to avoid CORS in dev.
            // Only registered when VITE_LLM_BASE_URL is set, so dev does
            // not silently fall through to a hardcoded host.
            // VITE_LLM_BASE_URL holds host only (no /v1 suffix).
            '/llm-proxy': {
              target: env.VITE_LLM_BASE_URL,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/llm-proxy/, ''),
            },
          }
        : undefined,
    },
  };
});

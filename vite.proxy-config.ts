/** The slice of http-proxy's server this module listens on. */
type ProxyServerLike = {
  on(
    event: 'error',
    listener: (err: NodeJS.ErrnoException, req: unknown, res: unknown) => void,
  ): unknown;
};

/** The slice of a Node ServerResponse the unreachable-backend answer writes to. */
type ResponseLike = {
  headersSent: boolean;
  writableEnded: boolean;
  writeHead(status: number, statusMessage: string, headers: Record<string, string>): unknown;
  end(body: string): unknown;
};

/** The slice of an incoming request the client check reads. */
type ClientRequestLike = { socket?: { remoteAddress?: string } };

export type ProxyEntry = {
  target: string;
  changeOrigin: boolean;
  rewrite: (path: string) => string;
  configure?: (proxy: ProxyServerLike, options: unknown) => void;
  /** Vite answers 404 when this returns false, and forwards when it returns undefined. */
  bypass?: (req: ClientRequestLike) => false | undefined;
};

export interface ProxyMapOptions {
  /**
   * The projection backend the local overlay names: `contract.local.yaml` `data_source.url`, generated into
   * `DATA_SOURCE_DEFAULT_URL`. The dev server forwards `/projection*` to it so the browser never reads it
   * cross-origin. It wins over `VITE_PROJECTION_API_URL` for that route, as it does in the browser (OMN-19994).
   */
  overlayProjectionUrl?: string;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return LOOPBACK_HOSTNAMES.has(hostname) || /^127\./.test(hostname);
  } catch {
    return false;
  }
}

function isLoopbackClient(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return v4 === '::1' || /^127\./.test(v4);
}

/**
 * OMN-19994 / D2: `onex dashboard` serves this install's projections on loopback only. A dev server started with
 * `--host` must not hand that loopback backend to the LAN, so a non-loopback client gets Vite's 404.
 */
function loopbackClientsOnly(req: ClientRequestLike): false | undefined {
  return isLoopbackClient(req.socket?.remoteAddress) ? undefined : false;
}

/**
 * OMN-19994 AC1: the dev server tells the browser it serves the overlay's projection backend same-origin, so
 * `resolveProjectionBaseUrl()` returns a relative base instead of the overlay URL. Only `vite` (serve) proxies;
 * a built bundle keeps the generated URL. The key is not `VITE_`-prefixed, so no env file can set it.
 */
export function sameOriginProjectionDefine(
  command: 'serve' | 'build',
  overlayProjectionUrl: string,
): Record<string, string> {
  if (command !== 'serve' || overlayProjectionUrl.trim() === '') return {};
  return { 'import.meta.env.OMNIDASH_SAME_ORIGIN_PROJECTION': JSON.stringify('1') };
}

/**
 * OMN-19915 — a dead projection backend names itself.
 *
 * Vite's built-in proxy error handler answers a bare `500` with an empty body,
 * and every widget renders that as `HTTP 500 Internal Server Error`: the same
 * words a real projection-API failure produces. On 2026-09-28 a stale
 * machine-local `.env.local` pointed this proxy at a port nothing listened on,
 * and the whole dashboard read as "the projection API is broken" while the API
 * was healthy and serving rows.
 *
 * Listeners registered by `configure` run before Vite's own, so this answer
 * wins and Vite's handler sees `headersSent` and stands down. 502 is the honest
 * status: the dev server is a gateway that could not reach its upstream. The
 * reason travels in the status line, which the widgets already print, and in a
 * typed JSON body for anything that reads it.
 */
const ENV_REMEDY =
  'VITE_PROJECTION_API_URL names a backend that is not answering; ' +
  'check .env.local, which Vite loads over .env';
const OVERLAY_REMEDY =
  'contract.local.yaml data_source.url names a backend that is not answering; ' +
  'start it (onex dashboard), or fix the URL and run npm run generate:config';

function answerUnreachableBackend(target: string, remedy = ENV_REMEDY): ProxyEntry['configure'] {
  return (proxy) => {
    proxy.on('error', (err, _req, rawRes) => {
      const res = rawRes as ResponseLike | undefined;
      if (!res || typeof res.writeHead !== 'function') return;
      if (res.headersSent || res.writableEnded) return;
      const cause = err.code ?? err.message;
      res.writeHead(502, `Projection backend unreachable: ${target} (${cause})`, {
        'Content-Type': 'application/json',
      });
      res.end(
        JSON.stringify({
          status: 'degraded',
          error: 'projection_backend_unreachable',
          target,
          cause,
          remedy,
        }),
      );
    });
  };
}

export function buildProxyMap(
  env: Record<string, string | undefined>,
  options: ProxyMapOptions = {},
): Record<string, ProxyEntry> {
  const proxyMap: Record<string, ProxyEntry> = {};
  const overlayProjectionUrl = options.overlayProjectionUrl?.trim().replace(/\/$/, '') ?? '';
  if (env.VITE_LLM_BASE_URL) {
    proxyMap['/llm-proxy'] = {
      target: env.VITE_LLM_BASE_URL,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/llm-proxy/, ''),
    };
  }

  if (env.VITE_OMNIDASH_API_URL) {
    proxyMap['/api/delegation/trigger'] = {
      target: env.VITE_OMNIDASH_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
  }

  if (env.VITE_PROJECTION_API_URL) {
    const configure = answerUnreachableBackend(env.VITE_PROJECTION_API_URL);
    proxyMap['/projection'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
      configure,
    };
    proxyMap['/api/projections'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
      configure,
    };
    proxyMap['/api/delegation'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
      configure,
    };
    proxyMap['/api/generate'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
      configure,
    };
    proxyMap['/api/compare'] = {
      target: env.VITE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path,
      configure,
    };
  }

  // OMN-19994 AC1: `/projection` (which also matches the `/projections` catalogue) goes to the overlay's backend.
  if (overlayProjectionUrl !== '') {
    proxyMap['/projection'] = {
      target: overlayProjectionUrl,
      changeOrigin: true,
      rewrite: (path) => path,
      configure: answerUnreachableBackend(overlayProjectionUrl, OVERLAY_REMEDY),
      ...(isLoopbackUrl(overlayProjectionUrl) ? { bypass: loopbackClientsOnly } : {}),
    };
  }

  // OMN-12995: the Express dev server (`npm run dev:server`, default :3002)
  // owns the server-side settings endpoints (`/api/settings/feature-flags`,
  // `/api/runtime-config`) that read process.env. Plain `vite` dev does not run
  // Express, so without this proxy these requests fall through to the SPA
  // history fallback and return index.html. When VITE_OMNIDASH_SERVER_URL is
  // set, route them to the Express server. When unset, the panels fall back to
  // their explicit client-side config state (a normal local-dev mode, not an
  // error).
  if (env.VITE_OMNIDASH_SERVER_URL) {
    proxyMap['/api/settings'] = {
      target: env.VITE_OMNIDASH_SERVER_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
    proxyMap['/api/runtime-config'] = {
      target: env.VITE_OMNIDASH_SERVER_URL,
      changeOrigin: true,
      rewrite: (path) => path,
    };
  }

  if (env.EVIDENCE_PROJECTION_API_URL) {
    proxyMap['/api/evidence-pipeline'] = {
      target: env.EVIDENCE_PROJECTION_API_URL,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/evidence-pipeline/, ''),
    };
  }

  return proxyMap;
}

// eslint-rules/no-non-authoritative-read-source.cjs
//
// OMN-12882 (Phase 6 Permanent Guardrails): dashboard source must not read from
// non-authoritative demo read origins.
//
// WHAT THIS RULE REJECTS:
//
//   1. String/template literals containing banned port patterns (:8765, :3010,
//      :3002) in any expression in src/ outside the approved seam. These ports
//      are non-authoritative demo origins:
//        :8765 — SEA demo server (not the canonical projection backend)
//        :3010 — merge proxy / demo composite server
//        :3002 — bespoke projection alt / stale direct-backend address
//      The authoritative read path is resolveProjectionBaseUrl() in
//      src/data-source/projection-base-url.ts, which picks the correct origin
//      from the contract + runtime override.
//
//   2. Direct imports of database client modules (pg, sqlite3, better-sqlite3)
//      in src/. Client components may not own a database connection. Server-side
//      db access belongs in server/ only.
//
//   3. References to 'evidence-pipeline-flow' in string/template literals in
//      src/. This path prefix belongs to a second backend authority (a separate
//      non-canonical event stream service) that was never wired as a contract-
//      declared projection endpoint. Reads must come from the canonical
//      /projection/{topic} surface only.
//
// WHAT PASSES:
//   - All standard /projection/{topic} fetches (no banned port).
//   - Relative path fetches (no host:port at all).
//   - Any code in server/ (server-side db access is allowed).
//   - Any code in src/data-source/ (the approved seam — it resolves the origin
//     from the contract; this is where banned-port env defaults live).
//   - Test/spec/story files (mocks may reference banned origins in fixtures).
//
// INLINE ESCAPE HATCH:
//   Add a line comment `// non-authoritative-read-ok: <reason>` on the same
//   line as the flagged expression to silence a specific finding. Use sparingly
//   and with a ticket reference — this is an assertion that the specific origin
//   is intentionally allowed, not a blanket bypass.

'use strict';

const ALLOWED_FILE = /\.(test|spec|stories)\.[cm]?[tj]sx?$/;

// Approved seams — files in these directories are not checked.
// Note: we match on the normalized path separator.
const APPROVED_DIR_PATTERNS = [
  /[\\/]server[\\/]/,
  /[\\/]src[\\/]data-source[\\/]/,
  /[\\/]src[\\/]services[\\/]/,
  // Generated config files are owned by contract.yaml / scripts; they may
  // declare the default URL for the data-source seam to consume.
  /[\\/]src[\\/]config[\\/]generated[\\/]/,
];

// Ports that identify non-authoritative demo read origins.
// Matches ':8765', ':3010', ':3002' anywhere in a string/template raw value.
const BANNED_PORT_RE = /:(8765|3010|3002)\b/;

// Database client package names that must not be imported in src/.
const BANNED_DB_PACKAGES = new Set(['pg', 'sqlite3', 'better-sqlite3']);

// Path prefix belonging to a second backend authority. Only flags when the
// string looks like a URL path segment (contains a slash before or after, or
// follows a '/v1/' prefix) — this avoids false-positives on React Query cache
// keys and other non-URL identifiers that happen to use the same name.
const BANNED_AUTHORITY_RE = /[/]evidence-pipeline-flow|evidence-pipeline-flow[/]/;

const ESCAPE_COMMENT = 'non-authoritative-read-ok';

/**
 * Return true if the source text of `node` has an inline escape comment on
 * the same line. We use `context.getSourceCode()` (ESLint 8) or
 * `context.sourceCode` (ESLint 9) for compatibility.
 */
function hasEscapeComment(context, node) {
  const sc = context.sourceCode ?? context.getSourceCode?.();
  if (!sc) return false;
  const comments = sc.getCommentsBefore?.(node) ?? [];
  const commentsAfter = sc.getCommentsAfter?.(node) ?? [];
  const all = [...comments, ...commentsAfter];
  return all.some((c) => c.value.includes(ESCAPE_COMMENT));
}

function isApprovedFile(filename) {
  if (!filename || filename === '<input>') return false;
  const normalized = filename.replace(/\\/g, '/');
  return APPROVED_DIR_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Extract raw string value from a Literal or TemplateLiteral node.
 * For TemplateLiteral we join all quasis (static parts) — sufficient to catch
 * literal port strings even when there are interpolations.
 */
function extractStringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((q) => q.value.raw).join('');
  }
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reads from non-authoritative demo read sources: banned ports ' +
        '(:8765/:3010/:3002), direct DB imports (pg/sqlite3/better-sqlite3), ' +
        'or second backend authorities (evidence-pipeline-flow). ' +
        'All dashboard reads must go through the canonical projection backend ' +
        'via src/data-source/ (OMN-12882).',
    },
    messages: {
      bannedPort:
        'Non-authoritative read source detected (OMN-12882): the port in "{{value}}" ' +
        'is a banned demo read origin (:8765=SEA, :3010=merge-proxy, :3002=alt-backend). ' +
        'All reads must route through the canonical projection backend via ' +
        'src/data-source/projection-base-url.ts. ' +
        'Suppress with: // non-authoritative-read-ok: <reason>',
      bannedDbImport:
        'Non-authoritative read source detected (OMN-12882): direct database client ' +
        'import "{{pkg}}" in src/. Dashboard components must not own a database ' +
        'connection. DB access belongs in server/ only. ' +
        'Suppress with: // non-authoritative-read-ok: <reason>',
      bannedAuthority:
        'Non-authoritative read source detected (OMN-12882): "evidence-pipeline-flow" ' +
        'in "{{value}}" is a second backend authority not wired as a canonical ' +
        'projection endpoint. Use /projection/{topic} via src/data-source/ instead. ' +
        'Suppress with: // non-authoritative-read-ok: <reason>',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string' ? context.filename : context.getFilename?.() ?? '';

    // Skip test/spec/story files.
    if (ALLOWED_FILE.test(filename)) return {};

    // Skip approved seam directories.
    if (isApprovedFile(filename)) return {};

    // Only enforce inside src/ (+ shared/ for completeness).
    const normalized = filename.replace(/\\/g, '/');
    const inScope =
      /[\\/]src[\\/]/.test(normalized) ||
      /[\\/]shared[\\/]/.test(normalized);
    if (!inScope) return {};

    function checkStringNode(node) {
      if (hasEscapeComment(context, node)) return;
      const value = extractStringValue(node);
      if (!value) return;

      if (BANNED_PORT_RE.test(value)) {
        context.report({
          node,
          messageId: 'bannedPort',
          data: { value },
        });
        return; // one report per node is enough
      }

      if (BANNED_AUTHORITY_RE.test(value)) {
        context.report({
          node,
          messageId: 'bannedAuthority',
          data: { value },
        });
      }
    }

    return {
      // Check every string literal and template literal in scope.
      Literal(node) {
        if (typeof node.value === 'string') checkStringNode(node);
      },
      TemplateLiteral(node) {
        checkStringNode(node);
      },

      // Check import declarations for banned DB packages.
      ImportDeclaration(node) {
        const pkg = node.source && node.source.value;
        if (typeof pkg === 'string' && BANNED_DB_PACKAGES.has(pkg)) {
          if (hasEscapeComment(context, node)) return;
          context.report({
            node,
            messageId: 'bannedDbImport',
            data: { pkg },
          });
        }
      },

      // Also catch require() calls for banned DB packages (CommonJS in scripts/).
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          typeof node.arguments[0].value === 'string' &&
          BANNED_DB_PACKAGES.has(node.arguments[0].value)
        ) {
          if (hasEscapeComment(context, node)) return;
          context.report({
            node,
            messageId: 'bannedDbImport',
            data: { pkg: node.arguments[0].value },
          });
        }
      },
    };
  },
};

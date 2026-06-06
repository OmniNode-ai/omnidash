import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Send, Loader, Check, AlertCircle } from 'lucide-react';
import { Text } from '@/components/ui/typography';
import { useDispatch } from './useDispatch';

const KNOWN_NODES = [
  { id: 'node_build_loop', kind: 'ORCHESTRATOR' },
  { id: 'node_log_persistence_effect', kind: 'EFFECT' },
  { id: 'node_dispatch_request_handler', kind: 'ORCHESTRATOR' },
  { id: 'node_test_runner', kind: 'COMPUTE' },
  { id: 'node_projection_traces', kind: 'REDUCER' },
  { id: 'node_dispatch_worker', kind: 'EFFECT' },
  { id: 'node_intent_classifier', kind: 'COMPUTE' },
  { id: 'node_evidence_pipeline', kind: 'ORCHESTRATOR' },
];

type PaletteState = 'search' | 'payload' | 'result';
type DispatchState = 'idle' | 'sending' | 'success' | 'error';

interface NodeEntry {
  id: string;
  kind: string;
}

interface CommandPaletteProps {
  onClose: () => void;
}

// Each node type maps to the design-system node-type role tokens
// (--<kind>, --<kind>-soft, --<kind>-ink) defined in design-tokens.css for
// both light and dark themes. Using one token family per type — instead of
// mixing var(--accent)/var(--text-tertiary) with hardcoded hex — renders all
// four badges as consistent, theme-aware chips with adequate contrast.
function kindTokens(kind: string): { border: string; bg: string; ink: string } {
  const role =
    kind === 'ORCHESTRATOR' ? 'orchestrator'
    : kind === 'COMPUTE' ? 'compute'
    : kind === 'EFFECT' ? 'effect'
    : kind === 'REDUCER' ? 'reducer'
    : 'compute';
  return {
    border: `var(--${role})`,
    bg: `var(--${role}-soft)`,
    ink: `var(--${role}-ink)`,
  };
}

function NodeKindBadge({ kind }: { kind: string }) {
  const { border, bg, ink } = kindTokens(kind);
  return (
    <span style={{ border: `1px solid ${border}`, background: bg, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
      <Text size="xs" family="mono" style={{ color: ink }}>{kind}</Text>
    </span>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [stage, setStage] = useState<PaletteState>('search');
  const [query, setQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeEntry | null>(null);
  const [payloadText, setPayloadText] = useState('{}');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<DispatchState>('idle');
  const [dispatchResult, setDispatchResult] = useState<{ request_id?: string; status?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { dispatch } = useDispatch();
  const searchRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<HTMLTextAreaElement>(null);

  const filtered = KNOWN_NODES.filter((n) =>
    !query.trim() || n.id.toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (stage === 'search') searchRef.current?.focus();
    if (stage === 'payload') payloadRef.current?.focus();
  }, [stage]);

  useEffect(() => setActiveIndex(0), [query]);

  const handleSelect = useCallback((node: NodeEntry) => {
    setSelectedNode(node);
    setStage('payload');
    setPayloadText('{}');
    setPayloadError(null);
  }, []);

  const handleDispatch = useCallback(async () => {
    if (!selectedNode) return;
    let parsed: Record<string, unknown>;
    try {
      const raw: unknown = JSON.parse(payloadText);
      if (!isRecord(raw)) throw new Error('Payload must be a JSON object');
      parsed = raw;
    } catch (err) {
      setPayloadError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }
    setPayloadError(null);
    setDispatchState('sending');
    try {
      const res = await dispatch({
        command_type: 'run-node',
        target_node_id: selectedNode.id,
        payload: parsed,
      });
      setDispatchResult(res);
      setDispatchState('success');
      setStage('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Dispatch failed');
      setDispatchState('error');
      setStage('result');
    }
  }, [selectedNode, payloadText, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (stage !== 'search') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[activeIndex]) { handleSelect(filtered[activeIndex]); }
  };

  return (
    <div
      data-testid="command-palette-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '20vh',
      }}
    >
      <div
        data-testid="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          width: 540, maxWidth: '90vw',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          {stage === 'search' && <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
          {stage === 'payload' && selectedNode && (
            <Text size="sm" color="brand" family="mono" style={{ flexShrink: 0 }}>{selectedNode.id}</Text>
          )}
          {stage === 'result' && (
            dispatchState === 'success'
              ? <Check size={16} style={{ color: 'var(--good)', flexShrink: 0 }} />
              : <AlertCircle size={16} style={{ color: 'var(--bad)', flexShrink: 0 }} />
          )}
          {stage === 'search' && (
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              aria-label="Search nodes"
              className="text-input-md"
              style={{ flex: 1, border: 0, outline: 0, background: 'transparent' }}
            />
          )}
          {stage !== 'search' && <div style={{ flex: 1 }} />}
          <button
            aria-label="Close command palette"
            onClick={onClose}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
              color: 'var(--text-tertiary)', padding: 2, borderRadius: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search stage */}
        {stage === 'search' && (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Text size="sm" color="tertiary">No nodes found</Text>
              </div>
            )}
            {filtered.map((node, i) => (
              <button
                key={node.id}
                data-testid={`node-option-${node.id}`}
                onClick={() => handleSelect(node)}
                style={{
                  all: 'unset', display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 14px', cursor: 'pointer',
                  background: i === activeIndex ? 'var(--accent-soft)' : 'transparent',
                  borderBottom: '1px solid var(--line-2)',
                  boxSizing: 'border-box',
                }}
              >
                <Text size="sm" color="primary" family="mono" style={{ flex: 1 }}>{node.id}</Text>
                <NodeKindBadge kind={node.kind} />
              </button>
            ))}
          </div>
        )}

        {/* Payload stage */}
        {stage === 'payload' && selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
              <Text size="xs" color="tertiary">Edit the JSON payload to dispatch with</Text>
            </div>
            {/* textarea is exempt from the typography rule — it is a form control, not text display */}
            <textarea
              ref={payloadRef}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              aria-label="Dispatch payload JSON"
              spellCheck={false}
              rows={6}
              className="dispatch-payload-editor"
              style={{
                border: 0, outline: 0, resize: 'none', padding: '10px 14px',
                background: 'var(--bg-sunken)', borderBottom: '1px solid var(--line)',
              }}
            />
            {payloadError && (
              <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)' }}>
                <Text size="xs" style={{ color: 'var(--bad)' }}>{payloadError}</Text>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
              <button
                onClick={() => { setStage('search'); setSelectedNode(null); }}
                style={{ all: 'unset', cursor: 'pointer' }}
              >
                <Text size="sm" color="tertiary">Back</Text>
              </button>
              <button
                data-testid="dispatch-submit"
                onClick={() => { void handleDispatch(); }}
                disabled={dispatchState === 'sending'}
                style={{
                  all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 6,
                  // var(--accent) resolves to --brand-soft (a pale hover tint), not the
                  // brand color — so it paired badly with literal 'white' text and went
                  // invisible in light mode. Use the brand fill + its on-brand text token
                  // (--primary-foreground = --brand-ink) so the CTA stays legible in both themes.
                  background: dispatchState === 'sending' ? 'var(--panel-2)' : 'var(--brand)',
                  color: dispatchState === 'sending' ? 'var(--text-tertiary)' : 'var(--primary-foreground)',
                  cursor: dispatchState === 'sending' ? 'not-allowed' : 'pointer',
                }}
              >
                {dispatchState === 'sending'
                  ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Send size={14} />}
                <Text size="sm" weight="medium" style={{ color: 'inherit' }}>Dispatch</Text>
              </button>
            </div>
          </div>
        )}

        {/* Result stage */}
        {stage === 'result' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dispatchState === 'success' && dispatchResult ? (
              <>
                <Text size="sm" style={{ color: 'var(--good)' }}>Dispatched successfully</Text>
                <Text size="xs" color="secondary" family="mono">
                  {`request_id: ${dispatchResult.request_id ?? '—'}`}
                </Text>
                <Text size="xs" color="secondary" family="mono">
                  {`status: ${dispatchResult.status ?? '—'}`}
                </Text>
              </>
            ) : (
              <>
                <Text size="sm" style={{ color: 'var(--bad)' }}>Dispatch failed</Text>
                {errorMsg && <Text size="xs" color="secondary" family="mono">{errorMsg}</Text>}
              </>
            )}
            <button
              onClick={onClose}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 14px',
                borderRadius: 6, border: '1px solid var(--line)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                alignSelf: 'flex-end',
              }}
            >
              <Text size="sm" color="secondary">Close</Text>
            </button>
          </div>
        )}

        {/* Footer hint */}
        {stage === 'search' && (
          <div style={{ padding: '6px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 12 }}>
            <Text size="xs" color="tertiary">↑↓ navigate</Text>
            <Text size="xs" color="tertiary">↵ select</Text>
            <Text size="xs" color="tertiary">Esc close</Text>
          </div>
        )}
      </div>
    </div>
  );
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}

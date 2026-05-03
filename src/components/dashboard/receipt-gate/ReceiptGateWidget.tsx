import { useState, useEffect } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { CardHeader } from '@/components/primitives';

// ── Synthetic data ──────────────────────────────────────────────────

const RECEIPT_GATES = [
  { id: 'g1', name: 'Schema valid', pass: true, detail: 'contract.yaml validates against ONEX v1.4' },
  { id: 'g2', name: 'Identity distinct', pass: true, detail: 'verifier ≠ worker (caught 2 forgeries to date)' },
  { id: 'g3', name: 'Evidence bundle', pass: true, detail: '12 artifacts hash-bound to receipt' },
  { id: 'g4', name: 'Topic naming', pass: true, detail: 'onex.evt.omnimarket.routed.v3' },
  { id: 'g5', name: 'Cost ledger entry', pass: true, detail: '$0.000 logged · qwen3-coder-30b' },
  { id: 'g6', name: 'Independent verify', pass: true, detail: 'deepseek-r1-32b signed at 17:42:08' },
  { id: 'g7', name: 'Reach-in scan', pass: true, detail: 'no cross-node imports detected' },
  { id: 'g8', name: 'Architecture lint', pass: true, detail: 'compat → core → spi → infra clean' },
];

// ── CheckMark icon ──────────────────────────────────────────────────

function CheckMark({ pass }: { pass: boolean }) {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        background: pass ? 'var(--good)' : 'var(--bad)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10">
        {pass ? (
          <path d="M2,5 L4.5,7.5 L8.5,3" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3,3 L7,7 M7,3 L3,7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

// ── Stamp icon ──────────────────────────────────────────────────────

function Stamp({ pass }: { pass: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: pass ? 'var(--good)' : 'var(--ink-3)',
        boxShadow: pass ? '0 0 0 3px var(--good-soft)' : 'none',
        display: 'inline-block',
      }}
    />
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export default function ReceiptGateWidget() {
  const allGates = RECEIPT_GATES;
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setRevealed((r) => (r >= allGates.length ? r : r + 1));
    }, 220);
    return () => clearInterval(id);
  }, [allGates.length]);

  const passed = allGates.filter((g) => g.pass).length;
  const total = allGates.length;
  const allPass = revealed >= total && passed === total;

  return (
    <ComponentWrapper
      title="Receipt Gate"
      isLoading={false}
      isEmpty={false}
    >
      <div style={{ width: '100%' }}>
        <CardHeader
          eyebrow="Receipt gate · PR #4471"
          title="Independent verifier signed."
          right={
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 6,
                background: allPass ? 'var(--good-soft)' : 'var(--bg-sunken)',
                color: allPass ? 'var(--good)' : 'var(--ink-3)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              <Stamp pass={allPass} />
              {allPass ? 'MERGED' : 'VERIFYING…'}
            </div>
          }
        />

        {/* Progress meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="mono tnum" style={{ fontSize: 28, fontWeight: 800, color: 'var(--good)' }}>
            {Math.min(revealed, passed)}
            <span style={{ color: 'var(--ink-3)', fontSize: 18, fontWeight: 600 }}>/{total}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: 'var(--good)' }}>gates passed</div>
            <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(revealed / total) * 100}%`, height: '100%', background: 'var(--good)', transition: 'width .25s' }} />
            </div>
          </div>
        </div>

        {/* Gates list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {allGates.map((g, i) => {
            const shown = i < revealed;
            return (
              <div
                key={g.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: i < allGates.length - 1 ? '1px dashed var(--line-2)' : 'none',
                  opacity: shown ? 1 : 0.25,
                  transition: 'opacity .3s',
                }}
              >
                <div>{shown && <CheckMark pass={g.pass} />}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{g.name}</div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.detail}
                  </div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.16em', fontWeight: 700 }}
                >
                  g.{String(i + 1).padStart(2, '0')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Receipt manifest */}
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: 'var(--bg-sunken)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--ink-2)',
            lineHeight: 1.6,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 6 }}>receipt manifest</div>
          <div className="mono">
            worker: <span style={{ color: 'var(--compute-ink)' }}>qwen3-coder-30b</span>
            <br />
            verifier: <span style={{ color: 'var(--reducer-ink)' }}>deepseek-r1-32b</span>
            <br />
            evidence: <span style={{ color: 'var(--ink)' }}>12 artifacts {'·'} sha256:0xa31f{'…'}b8c4</span>
            <br />
            signed: <span style={{ color: 'var(--ink)' }}>2026-05-03T17:42:08Z</span>
          </div>
        </div>
      </div>
    </ComponentWrapper>
  );
}

// OMN-13007 — chrome DATA SOURCE control.
//
// Occupies the left-most position in the dashboard filter cluster (the spot the
// timezone picker used to sit in, which looked like a data-source selector but
// was not). This is the honest, runtime-switchable data-source control:
//
//   - The TRIGGER button shows the CURRENT effective source honestly:
//       * Live -> "Live" + the backend host:port (green / compute palette).
//       * File -> "File fixtures" with a prominent warn/fixture treatment so
//         file mode can never masquerade as live.
//   - The MENU lets the operator switch at runtime: pick Live (and enter/confirm
//     a backend base URL, defaulted from env when present) or File. The choice
//     persists via the override seam (`setDataSourceOverride`) and overrides the
//     env-resolved default in `resolveProjectionBaseUrl()` / mode resolution —
//     one seam, every consumer (projection reads + SEA generate submit) follows.
//
// Visual language reuses the honesty palette (compute = live, warn = fixtures)
// established by HonestyStateBadge (OMN-12981 lineage).
import { useState } from 'react';
import { Database, HardDrive, ChevronDown, Check } from 'lucide-react';
import {
  PositionedMenu,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { Text } from '@/components/ui/typography';
import {
  resolveProjectionBaseUrl,
} from '@/data-source/projection-base-url';
import {
  setDataSourceOverride,
} from '@/data-source/data-source-override';
import { useEffectiveDataSource } from '@/data-source/useDataSourceOverride';

/** Strip the scheme + trailing slash for a compact "host:port" trigger label. */
function hostLabel(baseUrl: string): string {
  const stripped = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return stripped || 'same-origin';
}

export function DataSourceControl() {
  const effective = useEffectiveDataSource();
  const menu = usePositionedMenu();

  const isFile = effective.mode === 'file';

  // The base URL the resolver would currently use for live reads. In file mode
  // this is null, so we fall back to a sensible default for the input seed.
  const resolvedBase = isFile ? null : resolveProjectionBaseUrl();

  // Live-mode base URL the operator is editing in the menu. Seeded from the
  // override base, else the resolved/env base, else empty (same-origin proxy).
  const [draftUrl, setDraftUrl] = useState<string>(() => {
    if (effective.baseUrl) return effective.baseUrl;
    return resolvedBase ?? '';
  });

  const triggerLabel = isFile
    ? 'File fixtures'
    : `Live — ${hostLabel(resolvedBase ?? '')}`;

  const applyLive = () => {
    setDataSourceOverride({ mode: 'live', baseUrl: draftUrl.trim() || undefined });
    menu.close();
  };
  const applyFile = () => {
    setDataSourceOverride({ mode: 'file' });
    menu.close();
  };

  // Honest trigger treatment: file mode gets the warn/fixture palette; live gets
  // the compute (green) palette. The two are deliberately not confusable.
  const triggerStyle: React.CSSProperties = isFile
    ? {
        background: 'var(--warn-soft)',
        border: '1px solid var(--warn)',
        color: 'var(--warn)',
      }
    : {
        background: 'var(--compute-soft)',
        border: '1px solid var(--compute)',
        color: 'var(--compute-ink)',
      };

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        data-testid="data-source-control-trigger"
        data-mode={isFile ? 'file' : 'live'}
        onClick={menu.open}
        aria-label="Data source"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title={
          isFile
            ? 'Data source: File fixtures (development data — not live)'
            : `Data source: Live — ${hostLabel(resolvedBase ?? '')}`
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          ...triggerStyle,
        }}
      >
        {isFile ? <HardDrive size={14} /> : <Database size={14} />}
        <Text as="span" size="md" weight="semibold" color="inherit">
          {triggerLabel}
        </Text>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>
      {menu.isOpen && (
        <PositionedMenu
          anchor={menu.anchor}
          onClose={menu.close}
          placement="bottom-start"
          minWidth={300}
        >
          <div
            data-testid="data-source-menu"
            style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Live option + backend URL input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Database size={14} />
                <Text as="span" size="md" weight="semibold">Live projection backend</Text>
                {!isFile && (
                  <Check size={13} style={{ color: 'var(--compute)' }} aria-label="active" />
                )}
              </span>
              <input
                type="text"
                data-testid="data-source-url-input"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyLive();
                }}
                placeholder="http://host:port (blank = same-origin proxy)"
                aria-label="Backend base URL"
                className="text-input-sm mono"
                style={{
                  padding: '5px 8px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 4,
                  color: 'inherit',
                  width: '100%',
                }}
              />
              <button
                type="button"
                className="btn primary"
                data-testid="data-source-use-live"
                onClick={applyLive}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text size="md" color="inherit">Use live</Text>
              </button>
            </div>

            <div className="menu-sep" role="separator" />

            {/* File option */}
            <button
              type="button"
              className="btn ghost"
              data-testid="data-source-use-file"
              onClick={applyFile}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-start' }}
            >
              <HardDrive size={14} />
              <Text as="span" size="md" color="inherit">File fixtures (development data)</Text>
              {isFile && (
                <Check size={13} style={{ color: 'var(--warn)' }} aria-label="active" />
              )}
            </button>

            {isFile && (
              <Text size="xs" color="secondary">
                Fixtures are static development data — panels do not reflect live
                infrastructure. Switch to Live to render real projections.
              </Text>
            )}
          </div>
        </PositionedMenu>
      )}
    </>
  );
}

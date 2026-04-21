// SOURCE: Claude Design prototype
//   React:   src/app.jsx:618-678 (WidgetLibrary)
//   Styling: OmniDash.html:441-521 (.library, .lib-*) — ported verbatim to src/styles/library.css
// Deviations from source:
//   - v2 has no `addedTypes` (palette has no awareness of active dashboard widgets), so the
//     prototype's "Already on dashboard" badge is repurposed as a "not implemented" badge
//     for widgets whose status !== 'available'. The dashed/dim `.lib-card.added` treatment
//     communicates "unavailable" rather than "already placed" until OMN-44 wires up the
//     active-widget lookup.
//   - Drag-and-drop affordance (draggable, onDragStart/onDragEnd, `effectAllowed=copy`) is
//     deferred to OMN-44; palette uses click-to-add only for now.
//   - Thumbnail icon is derived from the manifest's category (visualization → LineChart, etc.)
//     rather than from an explicit `icon` manifest field, which v2 doesn't have.
import { useMemo, useState, type ComponentType } from 'react';
import {
  LineChart,
  Gauge,
  Table as TableIcon,
  ShieldCheck,
  Radio,
  LayoutGrid,
  X,
} from 'lucide-react';
import type { RegisteredComponent } from '@/registry/types';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@shared/types/component-manifest';

interface ComponentPaletteProps {
  components: RegisteredComponent[];
  onAddComponent: (name: string) => void;
  onClose?: () => void;
}

const CATEGORY_ICONS: Record<ComponentCategory, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  visualization: LineChart,
  metrics: Gauge,
  table: TableIcon,
  status: ShieldCheck,
  stream: Radio,
};

export function ComponentPalette({ components, onAddComponent, onClose }: ComponentPaletteProps) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return components;
    return components.filter(
      (c) =>
        c.manifest.displayName.toLowerCase().includes(query) ||
        c.manifest.description.toLowerCase().includes(query),
    );
  }, [components, q]);

  const grouped = useMemo(() => {
    const groups = new Map<ComponentCategory, RegisteredComponent[]>();
    for (const cat of COMPONENT_CATEGORIES) {
      groups.set(cat, []);
    }
    for (const c of filtered) {
      const list = groups.get(c.manifest.category);
      if (list) list.push(c);
    }
    return groups;
  }, [filtered]);

  return (
    <aside className="library open">
      <div className="lib-head">
        <div>
          <h3>Widget Library</h3>
          <p>Drag onto the dashboard, or click to add.</p>
        </div>
        {onClose && (
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close library"
            type="button"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="lib-search">
        <input
          placeholder="Search widgets…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search widgets"
        />
      </div>
      <div className="lib-body">
        {COMPONENT_CATEGORIES.map((cat) => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;
          const Icon = CATEGORY_ICONS[cat] ?? LayoutGrid;
          return (
            <div key={cat}>
              <div className="lib-group-title">{cat}</div>
              {items.map((c) => {
                const disabled = c.status !== 'available';
                return (
                  <div
                    key={c.name}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled || undefined}
                    className={`lib-card${disabled ? ' added' : ''}`}
                    onClick={() => !disabled && onAddComponent(c.name)}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onAddComponent(c.name);
                      }
                    }}
                  >
                    <div className="lib-card-thumb">
                      <Icon size={22} strokeWidth={1.5} />
                    </div>
                    <div className="lib-card-info">
                      <div className="lib-card-name">{c.manifest.displayName}</div>
                      <div className="lib-card-desc">{c.manifest.description}</div>
                      {disabled && <div className="lib-card-added-badge">· not implemented</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div
            style={{
              padding: '40px 10px',
              textAlign: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
            }}
          >
            No widgets match "{q}"
          </div>
        )}
      </div>
      <div className="lib-foot">
        <span>{components.length} widgets available</span>
        <span className="hint">drag or click</span>
      </div>
    </aside>
  );
}

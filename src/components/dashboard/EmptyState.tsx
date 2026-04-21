// SOURCE: Claude Design prototype
//   React:   src/app.jsx:546-583 (EmptyState component)
// Deviations from source:
//   - Prototype uses a custom <Icon name="grid"|"plus"/>; v2 uses lucide-react equivalents
//     (LayoutGrid, Plus) already present in other components.
//   - onAdd in v2 enters edit mode (which reveals the widget library) since v2 has no
//     separate libOpen state.
import { LayoutGrid, Plus } from 'lucide-react';

interface EmptyStateProps {
  onAdd: () => void;
}

export function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div
      style={{
        border: '1.5px dashed var(--line)',
        borderRadius: 14,
        padding: '56px 20px',
        textAlign: 'center',
        margin: '0 24px',
        color: 'var(--ink-3)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0 10px, var(--line-2) 10px 11px)',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 14px',
          color: 'var(--brand-ink)',
          position: 'relative',
        }}
      >
        <LayoutGrid size={22} strokeWidth={1.5} />
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: 6,
          position: 'relative',
        }}
      >
        This dashboard is empty
      </div>
      <div style={{ fontSize: 13, marginBottom: 16, position: 'relative' }}>
        Add a widget to start monitoring. Drag from the library, or click below.
      </div>
      <button
        className="btn primary"
        onClick={onAdd}
        style={{ position: 'relative' }}
      >
        <Plus size={14} /> Add first widget
      </button>
    </div>
  );
}

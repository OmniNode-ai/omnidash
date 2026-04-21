// SOURCE: Claude Design prototype
//   React:   src/app.jsx:618-680 (WidgetLibrary)
//   Styling: OmniDash.html:441-521 (.library, .lib-*) — ported verbatim to src/styles/library.css
// Deviations from source:
//   - OMN-47 follow-up: was using vanilla-extract ComponentPalette.css; now uses prototype
//     semantic class names from library.css.
//   - No search, no drag, no slide-in animation yet — those are OMN-44 scope. Current pass
//     keeps this as a static grouped list of v2's registered components but with prototype typography.
//   - No icon thumbnails (`.lib-card-thumb`) because v2 manifests don't carry an icon reference;
//     the `<div className="lib-card-info">` is the only child of each card for now.
//   - "not implemented" state styled via `.lib-card.added` class reuse (opacity 0.5, dashed border)
//     because that's the closest prototype analog to "disabled" visuals.
import { useMemo } from 'react';
import type { RegisteredComponent } from '@/registry/types';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@shared/types/component-manifest';

interface ComponentPaletteProps {
  components: RegisteredComponent[];
  onAddComponent: (name: string) => void;
}

export function ComponentPalette({ components, onAddComponent }: ComponentPaletteProps) {
  const grouped = useMemo(() => {
    const groups = new Map<ComponentCategory, RegisteredComponent[]>();
    for (const cat of COMPONENT_CATEGORIES) {
      groups.set(cat, []);
    }
    for (const c of components) {
      const list = groups.get(c.manifest.category);
      if (list) list.push(c);
    }
    return groups;
  }, [components]);

  return (
    <aside className="library open">
      <div className="lib-head">
        <div>
          <h3>Widget Library</h3>
          <p>Click a widget to add it to the dashboard.</p>
        </div>
      </div>
      <div className="lib-body">
        {COMPONENT_CATEGORIES.map((cat) => {
          const items = grouped.get(cat) || [];
          if (items.length === 0) return null;
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
      </div>
    </aside>
  );
}

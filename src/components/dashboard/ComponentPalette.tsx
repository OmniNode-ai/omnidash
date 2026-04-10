import { useMemo } from 'react';
import type { RegisteredComponent } from '@/registry/types';
import { COMPONENT_CATEGORIES, type ComponentCategory } from '@shared/types/component-manifest';
import * as s from './ComponentPalette.css';

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
    <div className={s.palette}>
      {COMPONENT_CATEGORIES.map((cat) => {
        const items = grouped.get(cat) || [];
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <div className={s.categoryLabel}>{cat}</div>
            {items.map((c) => {
              const disabled = c.status !== 'available';
              return (
                <button
                  key={c.name}
                  className={`${s.componentItem} ${disabled ? s.componentItemDisabled : ''}`}
                  onClick={() => !disabled && onAddComponent(c.name)}
                  disabled={disabled}
                  type="button"
                >
                  <div className={s.componentName}>
                    {c.manifest.displayName}
                    {disabled && <span className={s.badge}>not implemented</span>}
                  </div>
                  <div className={s.componentDescription}>{c.manifest.description}</div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

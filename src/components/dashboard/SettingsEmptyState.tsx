import type { ReactNode } from 'react';

/**
 * OMN-21166 part 26 revision 3: an empty Settings section says in one place what is missing and the one terminal step
 * that fills it, the way settings pages in comparable products show an empty list. Nothing here decides a state. The icon
 * sits in the title line, so its label is read beside the words it names (identity census).
 */
export function SettingsEmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="local-settings-empty" role="status">
      <p className="local-settings-empty-title">{icon}{title}</p>
      <p className="local-settings-empty-text">{children}</p>
      {action && <div className="local-settings-empty-action">{action}</div>}
    </div>
  );
}

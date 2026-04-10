import * as s from './Sidebar.css';

export interface SidebarProps {
  dashboards: Array<{ id: string; name: string }>;
  activeDashboardId?: string;
  onDashboardSelect: (id: string) => void;
  onCreateNew: () => void;
}

export function Sidebar({ dashboards, activeDashboardId, onDashboardSelect, onCreateNew }: SidebarProps) {
  return (
    <nav className={s.sidebar}>
      <div className={s.navSection}>
        <div className={s.navLabel}>Dashboards</div>
        {dashboards.map((d) => (
          <button
            key={d.id}
            className={s.navItem}
            onClick={() => onDashboardSelect(d.id)}
            style={{ fontWeight: d.id === activeDashboardId ? 700 : 400 }}
          >
            {d.name}
          </button>
        ))}
        <button className={s.navItem} onClick={onCreateNew}>
          + New Dashboard
        </button>
      </div>
    </nav>
  );
}

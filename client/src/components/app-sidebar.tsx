import {
  Radio,
  ChevronRight,
  Search,
  Layers,
  Globe,
  Brain,
  Sparkles,
  ShieldCheck,
  Gauge,
  Activity,
  Lightbulb,
  Zap,
  FlaskConical,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/** A single sidebar navigation entry with its route, icon, and description. */
interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
  /** Indented sub-page indicator */
  indent?: boolean;
}

// OMN-2181: Phase 2 category dashboards as primary navigation
// OMN-2180: Product-facing navigation groups (preserved as sub-pages)
//
// Hidden routes (registered in App.tsx but not in sidebar navigation):
//   /graph             -- Execution Graph (node execution visualization)
//   /live-events       -- Demo Stream (superseded by Event Stream)
//   /discovery         -- Registry Discovery (standalone discovery page)
//   /intelligence      -- Intelligence Operations (archived legacy, OMN-1377)
//   /code              -- Code Intelligence (archived legacy, OMN-1377)
//   /events-legacy     -- Event Flow (archived legacy, OMN-1377)
//   /event-bus         -- Event Bus Explorer (archived legacy, OMN-1377)
//   /knowledge         -- Knowledge Graph (archived legacy, OMN-1377)
//   /health            -- Platform Health (archived legacy, OMN-1377)
//   /developer         -- Developer Experience (archived legacy, OMN-1377)
//   /chat              -- Chat interface
//   /demo              -- Dashboard Demo
//   /effectiveness/*   -- Effectiveness sub-pages (latency, utilization, ab)
//   /preview/*         -- 17 preview/prototype pages

// ─────────────────────────────────────────────────────────────────────────────
// Category Dashboards (OMN-2181)
// ─────────────────────────────────────────────────────────────────────────────

const categories: NavItem[] = [
  {
    title: 'Speed & Responsiveness',
    url: '/category/speed',
    icon: Zap,
    description: 'Cache hit rate, latency percentiles, pipeline health',
  },
  {
    title: 'Success & Testing',
    url: '/category/success',
    icon: FlaskConical,
    description: 'A/B comparison, injection hit rates, effectiveness trends',
  },
  {
    title: 'Intelligence',
    url: '/category/intelligence',
    icon: Brain,
    description: 'Pattern utilization, intent classification, behavior tracking',
  },
  {
    title: 'System Health',
    url: '/category/health',
    icon: ShieldCheck,
    description: 'Validation counts, node registry, health checks',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Monitoring (drill-down pages)
// ─────────────────────────────────────────────────────────────────────────────

const monitoring: NavItem[] = [
  {
    title: 'Event Stream',
    url: '/events',
    icon: Radio,
    description: 'Real-time Kafka event stream visualization',
  },
  {
    title: 'Pipeline Metrics',
    url: '/extraction',
    icon: Gauge,
    description: 'Pattern extraction metrics and pipeline health',
    indent: true,
  },
  {
    title: 'Injection Performance',
    url: '/effectiveness',
    icon: Activity,
    description: 'Injection effectiveness metrics and A/B analysis',
    indent: true,
  },
];

const intelligence: NavItem[] = [
  {
    title: 'Intent Signals',
    url: '/intents',
    icon: Brain,
    description: 'Real-time intent classification and analysis',
    indent: true,
  },
  {
    title: 'Pattern Intelligence',
    url: '/patterns',
    icon: Sparkles,
    description: 'Code pattern discovery and learning analytics',
    indent: true,
  },
];

const system: NavItem[] = [
  {
    title: 'Node Registry',
    url: '/registry',
    icon: Globe,
    description: 'Contract-driven node and service discovery',
    indent: true,
  },
  {
    title: 'Validation',
    url: '/validation',
    icon: ShieldCheck,
    description: 'Cross-repo validation runs and violation trends',
    indent: true,
  },
];

const tools: NavItem[] = [
  {
    title: 'Correlation Trace',
    url: '/trace',
    icon: Search,
    description: 'Trace events by correlation ID',
  },
  {
    title: 'Learned Insights',
    url: '/insights',
    icon: Lightbulb,
    description: 'Patterns and conventions from OmniClaude sessions',
  },
];

const previews: NavItem[] = [
  {
    title: 'Widget Showcase',
    url: '/showcase',
    icon: Layers,
    description: 'All 5 contract-driven widget types',
  },
];

/** Props for {@link NavGroup}. */
interface NavGroupProps {
  label: string;
  items: NavItem[];
  location: string;
}

/** Renders a labelled sidebar group with active-route highlighting. */
function NavGroup({ label, items, location }: NavGroupProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs uppercase tracking-wider px-3 mb-2">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const normalizedLocation = location.split(/[?#]/)[0];
            const isActive =
              normalizedLocation === item.url ||
              (item.url === '/events' && normalizedLocation === '/') ||
              normalizedLocation.startsWith(`${item.url}/`);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.description}
                  className={cn('group', isActive && 'bg-sidebar-accent', item.indent && 'pl-7')}
                  data-testid={`nav-${item.url.slice(1).replace(/\//g, '-')}`}
                >
                  <Link href={item.url}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                    {isActive && (
                      <ChevronRight className="w-4 h-4 ml-auto text-sidebar-accent-foreground" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Primary application sidebar with category dashboards and drill-down pages. */
export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <NavGroup label="Dashboards" items={categories} location={location} />
        <NavGroup label="Monitoring" items={monitoring} location={location} />
        <NavGroup label="Intelligence" items={intelligence} location={location} />
        <NavGroup label="System" items={system} location={location} />
        <NavGroup label="Tools" items={tools} location={location} />
        <NavGroup label="Preview" items={previews} location={location} />
      </SidebarContent>
    </Sidebar>
  );
}

import {
  Radio,
  ChevronRight,
  ChevronDown,
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
  Wrench,
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
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/** A single sidebar navigation entry with its route, icon, and description. */
interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
}

// OMN-2182: Phase 3 -- Retire legacy views, tuck granular pages under Advanced
// OMN-2181: Phase 2 category dashboards remain as primary navigation
//
// Default nav shows only 4 category pages.
// Advanced/Developer section accessible for granular drill-down views.
// No functionality removed -- just reorganized.
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
// Category Dashboards (OMN-2181) -- primary navigation
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
// Advanced / Developer section (granular drill-down pages)
// ─────────────────────────────────────────────────────────────────────────────

/** A labelled group of nav items within the Advanced section. */
interface AdvancedSubGroup {
  label: string;
  items: NavItem[];
}

const advancedSubGroups: AdvancedSubGroup[] = [
  {
    label: 'Monitoring',
    items: [
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
      },
      {
        title: 'Injection Performance',
        url: '/effectiveness',
        icon: Activity,
        description: 'Injection effectiveness metrics and A/B analysis',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        title: 'Intent Signals',
        url: '/intents',
        icon: Brain,
        description: 'Real-time intent classification and analysis',
      },
      {
        title: 'Pattern Intelligence',
        url: '/patterns',
        icon: Sparkles,
        description: 'Code pattern discovery and learning analytics',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        title: 'Node Registry',
        url: '/registry',
        icon: Globe,
        description: 'Contract-driven node and service discovery',
      },
      {
        title: 'Validation',
        url: '/validation',
        icon: ShieldCheck,
        description: 'Cross-repo validation runs and violation trends',
      },
    ],
  },
  {
    label: 'Tools',
    items: [
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
    ],
  },
  {
    label: 'Preview',
    items: [
      {
        title: 'Widget Showcase',
        url: '/showcase',
        icon: Layers,
        description: 'All 5 contract-driven widget types',
      },
    ],
  },
];

/** All advanced-section URLs for determining whether the section should auto-expand. */
const advancedUrls = advancedSubGroups.flatMap((g) => g.items.map((i) => i.url));

/**
 * Returns true if the current location matches an advanced-section route.
 *
 * NOTE: The root path '/' is treated as an alias for '/events' (Event Stream).
 * It maps to the Advanced section, not to any category dashboard. If a
 * dashboard landing page is added in the future, this alias and the
 * corresponding isActive check below (line ~293) should be revisited.
 */
function isAdvancedRoute(location: string): boolean {
  const normalized = location.split(/[?#]/)[0];
  return advancedUrls.some(
    (url) =>
      normalized === url ||
      (url === '/events' && normalized === '/') ||
      normalized.startsWith(`${url}/`)
  );
}

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
              normalizedLocation === item.url || normalizedLocation.startsWith(`${item.url}/`);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.description}
                  className={cn('group', isActive && 'bg-sidebar-accent')}
                  data-testid={`nav-${item.url.slice(1).replace(/\//g, '-')}`}
                >
                  <Link href={item.url}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
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

/** Props for {@link AdvancedNavSection}. */
interface AdvancedNavSectionProps {
  location: string;
}

/** Collapsible Advanced section containing all granular drill-down pages. */
function AdvancedNavSection({ location }: AdvancedNavSectionProps) {
  const hasActiveChild = isAdvancedRoute(location);
  const [isOpen, setIsOpen] = useState(hasActiveChild);

  // Auto-expand when navigating to an advanced route.
  // Intentionally one-way: we only auto-expand, never auto-collapse.
  // If the user opens the section manually and then navigates to a
  // category dashboard, the section stays open so they can quickly
  // switch back without re-opening it.
  useEffect(() => {
    if (hasActiveChild) {
      setIsOpen(true);
    }
  }, [hasActiveChild]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="advanced-section">
      <SidebarGroup>
        <CollapsibleTrigger className="w-full" data-testid="advanced-section-trigger">
          <SidebarGroupLabel className="text-xs uppercase tracking-wider px-3 mb-2 cursor-pointer hover:text-sidebar-foreground transition-colors w-full">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            <span>Advanced</span>
            <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform duration-200 [[data-state=closed]_&]:-rotate-90" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarGroupContent>
            {advancedSubGroups.map((subGroup, groupIdx) => (
              <div key={subGroup.label}>
                {groupIdx > 0 && <SidebarSeparator className="my-1" />}
                <div className="px-3 py-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                    {subGroup.label}
                  </span>
                </div>
                <SidebarMenu>
                  {subGroup.items.map((item) => {
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
                          className={cn('group pl-5', isActive && 'bg-sidebar-accent')}
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
              </div>
            ))}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

/** Primary application sidebar with category dashboards and collapsible Advanced section. */
export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <NavGroup label="Dashboards" items={categories} location={location} />
        <AdvancedNavSection location={location} />
      </SidebarContent>
    </Sidebar>
  );
}

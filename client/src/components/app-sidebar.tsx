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

/** A single sidebar navigation entry with its route, icon, and tooltip text. */
interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
}

// OMN-2180: Product-facing navigation groups
// Routes are intentionally preserved -- only labels and grouping change.
// Hidden routes (still in App.tsx but excluded from sidebar):
//   /graph  — Execution Graph (node execution visualization)
//   /live-events — Demo Stream (superseded by Event Stream)

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
  },
  {
    title: 'Injection Performance',
    url: '/effectiveness',
    icon: Activity,
    description: 'Injection effectiveness metrics and A/B analysis',
  },
];

const intelligence: NavItem[] = [
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
];

const system: NavItem[] = [
  {
    title: 'Node Registry',
    url: '/discovery',
    icon: Globe,
    description: 'Contract-driven node and service discovery',
  },
  {
    title: 'Validation',
    url: '/validation',
    icon: ShieldCheck,
    description: 'Cross-repo validation runs and violation trends',
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
            const isActive = location === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={cn('group', isActive && 'bg-sidebar-accent')}
                  data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <Link href={item.url} title={item.description}>
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

/** Primary application sidebar with product-facing navigation groups. */
export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <NavGroup label="Monitoring" items={monitoring} location={location} />
        <NavGroup label="Intelligence" items={intelligence} location={location} />
        <NavGroup label="System" items={system} location={location} />
        <NavGroup label="Tools" items={tools} location={location} />
        <NavGroup label="Preview" items={previews} location={location} />
      </SidebarContent>
    </Sidebar>
  );
}

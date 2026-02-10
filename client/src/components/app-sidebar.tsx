import {
  Radio,
  ChevronRight,
  Search,
  Layers,
  Globe,
  Brain,
  Sparkles,
  ShieldCheck,
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

// Dashboards ordered by priority - core monitoring dashboards first
const dashboards = [
  {
    title: 'Event Bus',
    url: '/events',
    icon: Radio,
    description: 'Real-time Kafka event stream visualization',
  },
  {
    title: 'Pattern Learning',
    url: '/patterns',
    icon: Sparkles,
    description: 'Code pattern discovery and learning analytics',
  },
  {
    title: 'Registry Discovery',
    url: '/discovery',
    icon: Globe,
    description: 'Contract-driven node and service discovery',
  },
  {
    title: 'Intent Dashboard',
    url: '/intents',
    icon: Brain,
    description: 'Real-time intent classification and analysis',
  },
  {
    title: 'Validation',
    url: '/validation',
    icon: ShieldCheck,
    description: 'Cross-repo validation runs and violation trends',
  },
  {
    title: 'Learned Insights',
    url: '/insights',
    icon: Lightbulb,
    description: 'Patterns and conventions from OmniClaude sessions',
  },
  {
    title: 'Effectiveness',
    url: '/effectiveness',
    icon: Activity,
    description: 'Injection effectiveness metrics and A/B analysis',
  },
  // Hidden: Execution Graph (/graph) - node execution visualization
  // Hidden: Demo Stream (/live-events) - superseded by Event Bus
];

const tools = [
  {
    title: 'Correlation Trace',
    url: '/trace',
    icon: Search,
    description: 'Trace events by correlation ID',
  },
];

const previews = [
  {
    title: 'Widget Showcase',
    url: '/showcase',
    icon: Layers,
    description: 'All 5 contract-driven widget types',
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider px-3 mb-2">
            Dashboards
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboards.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn('group', isActive && 'bg-sidebar-accent')}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider px-3 mb-2">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tools.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn('group', isActive && 'bg-sidebar-accent')}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider px-3 mb-2">
            Preview Features
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {previews.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn('group', isActive && 'bg-sidebar-accent')}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}
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
      </SidebarContent>
    </Sidebar>
  );
}

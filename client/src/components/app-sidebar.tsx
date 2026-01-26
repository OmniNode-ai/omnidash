import {
  Radio,
  ChevronRight,
  Search,
  Layers,
  Activity,
  GitBranch,
  Globe,
  Brain,
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

// Real dashboards - showing actual functionality from omnibase_infra
const dashboards = [
  {
    title: 'Live Events',
    url: '/live-events',
    icon: Activity,
    description: 'Real-time event stream (investor demo)',
  },
  {
    title: 'Execution Graph',
    url: '/graph',
    icon: GitBranch,
    description: 'Node execution visualization (investor demo)',
  },
  {
    title: 'Event Bus',
    url: '/events',
    icon: Radio,
    description: 'Kafka event stream visualization',
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

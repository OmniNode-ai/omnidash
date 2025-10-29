import { Bot, Network, Zap, Code, Activity, Database, Server, Users, ChevronRight, MessageSquare, Search, Eye, BarChart3, Settings, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const dashboards = [
  {
    title: "AI Agent Operations",
    url: "/",
    icon: Bot,
  },
  {
    title: "Pattern Learning",
    url: "/patterns",
    icon: Network,
  },
  {
    title: "Intelligence Operations",
    url: "/intelligence",
    icon: Zap,
  },
  {
    title: "Code Intelligence",
    url: "/code",
    icon: Code,
  },
  {
    title: "Event Flow",
    url: "/events",
    icon: Activity,
  },
  {
    title: "Knowledge Graph",
    url: "/knowledge",
    icon: Database,
  },
  {
    title: "Platform Health",
    url: "/health",
    icon: Server,
  },
  {
    title: "Developer Experience",
    url: "/developer",
    icon: Users,
  },
];

const tools = [
  {
    title: "AI Query Assistant",
    url: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Correlation Trace",
    url: "/trace",
    icon: Search,
  },
];

const previews = [
  {
    title: "Enhanced Analytics",
    url: "/preview/analytics",
    icon: BarChart3,
  },
  {
    title: "System Health",
    url: "/preview/health",
    icon: Shield,
  },
  {
    title: "Advanced Settings",
    url: "/preview/settings",
    icon: Settings,
  },
  {
    title: "Feature Showcase",
    url: "/preview/showcase",
    icon: Eye,
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
                      className={cn(
                        "group",
                        isActive && "bg-sidebar-accent"
                      )}
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
                      className={cn(
                        "group",
                        isActive && "bg-sidebar-accent"
                      )}
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
                      className={cn(
                        "group",
                        isActive && "bg-sidebar-accent"
                      )}
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

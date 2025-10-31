import { Bot, Network, Zap, Code, Activity, Database, Server, Users, ChevronRight, MessageSquare, Search, Eye, BarChart3, Settings, Shield, FileText, TrendingUp, Layers, Target, Calculator, BookOpen } from "lucide-react";
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
    title: "Agent Management",
    url: "/",
    icon: Bot,
  },
  {
    title: "Code Intelligence Suite",
    url: "/preview/code-intelligence-suite",
    icon: Code,
  },
  // Moved from Preview Features (ordered by importance)
  {
    title: "Intelligence Analytics",
    url: "/preview/intelligence-analytics",
    icon: BarChart3,
  },
  {
    title: "Platform Monitoring",
    url: "/preview/platform-monitoring",
    icon: Shield,
  },
  {
    title: "Architecture & Networks",
    url: "/preview/architecture-networks",
    icon: Network,
  },
  {
    title: "Developer Tools",
    url: "/preview/developer-tools",
    icon: Settings,
  },
  {
    title: "Contract Builder",
    url: "/preview/contracts",
    icon: FileText,
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
      title: "Feature Showcase",
      url: "/preview/showcase",
      icon: Eye,
      description: "Feature demos and interactive previews"
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

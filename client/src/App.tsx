import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AlertBanner } from "@/components/AlertBanner";
import { Activity } from "lucide-react";

import AgentOperations from "@/pages/AgentOperations";
import PatternLearning from "@/pages/PatternLearning";
import IntelligenceOperations from "@/pages/IntelligenceOperations";
import CodeIntelligence from "@/pages/CodeIntelligence";
import EventFlow from "@/pages/EventFlow";
import KnowledgeGraph from "@/pages/KnowledgeGraph";
import PlatformHealth from "@/pages/PlatformHealth";
import DeveloperExperience from "@/pages/DeveloperExperience";
import Chat from "@/pages/Chat";
import CorrelationTrace from "@/pages/CorrelationTrace";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AgentOperations} />
      <Route path="/patterns" component={PatternLearning} />
      <Route path="/intelligence" component={IntelligenceOperations} />
      <Route path="/code" component={CodeIntelligence} />
      <Route path="/events" component={EventFlow} />
      <Route path="/knowledge" component={KnowledgeGraph} />
      <Route path="/health" component={PlatformHealth} />
      <Route path="/developer" component={DeveloperExperience} />
      <Route path="/chat" component={Chat} />
      <Route path="/trace" component={CorrelationTrace} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h1 className="text-lg font-semibold">OmniNode</h1>
                        <p className="text-xs text-muted-foreground">Code Intelligence Platform</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-status-healthy animate-pulse" />
                      <span className="text-xs text-muted-foreground">System Operational</span>
                    </div>
                    <ThemeToggle />
                  </div>
                </header>

                <AlertBanner />

                <main className="flex-1 overflow-auto p-8">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

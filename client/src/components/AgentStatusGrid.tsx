import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  status: "active" | "idle" | "error" | "offline";
  currentTask?: string;
  successRate: number;
  quality?: number; // Quality score (0-100) based on confidence
  responseTime: number;
}

interface AgentStatusGridProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
  cardBackgroundClass?: string; // allow overriding card background (e.g., bg-muted)
  compact?: boolean;
}

export function AgentStatusGrid({ agents, onAgentClick, cardBackgroundClass, compact }: AgentStatusGridProps) {
  const getStatusColor = (status: Agent["status"]) => {
    switch (status) {
      case "active": return "bg-status-healthy";
      case "idle": return "bg-status-idle";
      case "error": return "bg-status-error";
      case "offline": return "bg-status-offline";
    }
  };

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-3">
      {agents.map((agent) => (
        <Card 
          key={agent.id} 
          className={cn(
            compact ? "p-3" : "p-4",
            "hover-elevate active-elevate-2 cursor-pointer transition-all border border-border/80",
            cardBackgroundClass,
            agent.status === "error" && "border-status-error/30"
          )}
          onClick={() => onAgentClick?.(agent)}
          data-testid={`card-agent-${agent.id}`}
        >
          <div className={cn("flex items-start justify-between", compact ? "mb-2" : "mb-3") }>
            <div className={cn("rounded-md bg-primary/10", compact ? "p-1.5" : "p-2") }>
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className={cn("h-2 w-2 rounded-full", getStatusColor(agent.status))} />
          </div>
          
          <div className={cn("font-medium truncate", compact ? "text-xs mb-0.5" : "text-sm mb-1")} title={agent.name}>
            {agent.name}
          </div>
          
          {agent.currentTask && (
            <div className={cn("text-muted-foreground truncate", compact ? "text-[11px] mb-1.5" : "text-xs mb-2")} title={agent.currentTask}>
              {agent.currentTask}
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <div className={cn("flex items-center gap-2", compact ? "text-[11px]" : "text-xs") }>
              <span className="text-muted-foreground text-[10px]">Success:</span>
              <span className="font-mono text-status-healthy">{agent.successRate}%</span>
            </div>
            {agent.quality !== undefined && (
              <div className={cn("flex items-center gap-2", compact ? "text-[11px]" : "text-xs") }>
                <span className="text-muted-foreground text-[10px]">Quality:</span>
                <span className="font-mono text-chart-1">{agent.quality}%</span>
              </div>
            )}
            <div className={cn("flex items-center gap-2", compact ? "text-[11px]" : "text-xs") }>
              <span className="text-muted-foreground text-[10px]">Response:</span>
              <span className="font-mono text-muted-foreground">{agent.responseTime}ms</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

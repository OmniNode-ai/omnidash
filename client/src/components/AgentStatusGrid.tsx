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
  responseTime: number;
}

interface AgentStatusGridProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
}

export function AgentStatusGrid({ agents, onAgentClick }: AgentStatusGridProps) {
  const getStatusColor = (status: Agent["status"]) => {
    switch (status) {
      case "active": return "bg-status-healthy";
      case "idle": return "bg-status-idle";
      case "error": return "bg-status-error";
      case "offline": return "bg-status-offline";
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
      {agents.map((agent) => (
        <Card 
          key={agent.id} 
          className={cn(
            "p-4 hover-elevate active-elevate-2 cursor-pointer transition-all",
            agent.status === "error" && "border-status-error/30"
          )}
          onClick={() => onAgentClick?.(agent)}
          data-testid={`card-agent-${agent.id}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className={cn("h-2 w-2 rounded-full", getStatusColor(agent.status))} />
          </div>
          
          <div className="text-sm font-medium mb-1 truncate" title={agent.name}>
            {agent.name}
          </div>
          
          {agent.currentTask && (
            <div className="text-xs text-muted-foreground mb-2 truncate" title={agent.currentTask}>
              {agent.currentTask}
            </div>
          )}
          
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-status-healthy">{agent.successRate}%</span>
            <span className="text-muted-foreground">•</span>
            <span className="font-mono text-muted-foreground">{agent.responseTime}ms</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

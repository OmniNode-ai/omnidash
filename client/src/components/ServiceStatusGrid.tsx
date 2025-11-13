import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Database, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface Service {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  uptime: number;
  responseTime: number;
  icon: "server" | "database" | "api" | "web";
}

interface ServiceStatusGridProps {
  services: Service[];
}

const iconMap = {
  server: Server,
  database: Database,
  api: Zap,
  web: Globe,
};

export function ServiceStatusGrid({ services }: ServiceStatusGridProps) {
  const getStatusColor = (status: Service["status"]) => {
    switch (status) {
      case "healthy": return "bg-status-healthy";
      case "degraded": return "bg-status-warning";
      case "down": return "bg-status-error";
    }
  };

  const getStatusBorder = (status: Service["status"]) => {
    switch (status) {
      case "healthy": return "border-card-border";
      case "degraded": return "border-status-warning/30";
      case "down": return "border-status-error/30";
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {services.map((service) => {
        const Icon = iconMap[service.icon];
        
        return (
          <Card
            key={service.id}
            className={cn(
              "p-4 hover-elevate active-elevate-2 cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
              getStatusBorder(service.status)
            )}
            tabIndex={0}
            role="button"
            aria-label={`View details for ${service.name} service`}
            data-testid={`card-service-${service.id}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                "p-2 rounded-md",
                service.status === "healthy" && "bg-status-healthy/10 text-status-healthy",
                service.status === "degraded" && "bg-status-warning/10 text-status-warning",
                service.status === "down" && "bg-status-error/10 text-status-error"
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className={cn("h-2 w-2 rounded-full", getStatusColor(service.status))} />
            </div>
            
            <h4 className="font-medium text-sm mb-3">{service.name}</h4>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime:</span>
                <span className="font-mono text-status-healthy">{service.uptime}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Response:</span>
                <span className="font-mono">{service.responseTime}ms</span>
              </div>
            </div>

            <Badge 
              variant="outline" 
              className={cn(
                "mt-3 w-full justify-center",
                service.status === "healthy" && "border-status-healthy/30 text-status-healthy",
                service.status === "degraded" && "border-status-warning/30 text-status-warning",
                service.status === "down" && "border-status-error/30 text-status-error"
              )}
            >
              {service.status}
            </Badge>
          </Card>
        );
      })}
    </div>
  );
}

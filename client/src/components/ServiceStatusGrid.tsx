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
      case "healthy": return "bg-green-500";
      case "degraded": return "bg-yellow-500";
      case "down": return "bg-red-500";
    }
  };

  const getStatusBorder = (status: Service["status"]) => {
    switch (status) {
      case "healthy": return "border-card-border";
      case "degraded": return "border-yellow-500/30";
      case "down": return "border-red-500/30";
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
              "p-6 hover-elevate active-elevate-2 cursor-pointer transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
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
                service.status === "healthy" && "bg-green-500/10 text-green-500",
                service.status === "degraded" && "bg-yellow-500/10 text-yellow-500",
                service.status === "down" && "bg-red-500/10 text-red-500"
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className={cn("h-2 w-2 rounded-full", getStatusColor(service.status))} />
            </div>
            
            <h4 className="font-medium text-sm mb-3">{service.name}</h4>

            <div className="space-y-2 text-xs font-normal">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Uptime:</span>
                <span className="font-mono font-normal text-green-500">{service.uptime}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-normal">Response:</span>
                <span className="font-mono font-normal">{service.responseTime}ms</span>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "mt-3 w-full justify-center",
                service.status === "healthy" && "border-green-500/30 text-green-500",
                service.status === "degraded" && "border-yellow-500/30 text-yellow-500",
                service.status === "down" && "border-red-500/30 text-red-500"
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

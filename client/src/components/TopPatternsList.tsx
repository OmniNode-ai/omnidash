import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopPattern {
  id: string;
  name: string;
  description: string;
  quality: number;
  usageCount: number;
  trend: number;
  category: string;
}

interface TopPatternsListProps {
  patterns: TopPattern[];
  limit?: number;
}

export function TopPatternsList({ patterns, limit = 10 }: TopPatternsListProps) {
  const topPatterns = patterns.slice(0, limit);

  return (
    <Card className="p-6" data-testid="list-top-patterns">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold">Top Performing Patterns</h3>
          <p className="text-sm text-muted-foreground mt-1">Most valuable patterns by quality and usage</p>
        </div>
        <Star className="w-5 h-5 text-primary" />
      </div>

      <div className="space-y-3">
        {topPatterns.map((pattern, index) => (
          <div 
            key={pattern.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-card-border hover-elevate active-elevate-2 cursor-pointer"
            data-testid={`pattern-${pattern.id}`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-bold text-sm">
              #{index + 1}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm">{pattern.name}</h4>
                <Badge variant="secondary" className="text-xs">{pattern.category}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{pattern.description}</p>
              
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Quality:</span>
                  <span className="font-mono text-status-healthy">{pattern.quality}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Usage:</span>
                  <span className="font-mono">{pattern.usageCount}x</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-sm">
              <TrendingUp className={cn(
                "w-4 h-4",
                pattern.trend > 0 ? "text-status-healthy" : "text-status-error"
              )} />
              <span className={cn(
                "font-mono",
                pattern.trend > 0 ? "text-status-healthy" : "text-status-error"
              )}>
                {pattern.trend > 0 ? "+" : ""}{pattern.trend}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

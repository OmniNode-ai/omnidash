import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface SectionHeaderProps {
  title: string;
  description: string;
  details?: string;
  level?: "h1" | "h2" | "h3";
  className?: string;
}

export function SectionHeader({
  title,
  description,
  details,
  level = "h2",
  className = "",
}: SectionHeaderProps) {
  const HeaderTag = level;

  const headerSizeClasses = {
    h1: "text-3xl font-bold",
    h2: "text-2xl font-bold",
    h3: "text-xl font-semibold",
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <HeaderTag className={headerSizeClasses[level]}>{title}</HeaderTag>
        {details && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={`More information about ${title}`}
              >
                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-2">
                <h4 className="font-semibold">{title}</h4>
                <p className="text-sm text-muted-foreground">{details}</p>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CapabilityTagsProps {
  capabilities: Record<string, unknown>;
  className?: string;
  maxVisible?: number;
}

export function CapabilityTags({ capabilities, className, maxVisible = 5 }: CapabilityTagsProps) {
  // Extract enabled capabilities (truthy values)
  const enabledCaps = Object.entries(capabilities)
    .filter(
      ([_, v]) =>
        v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.length > 0)
    )
    .map(([k]) => k);

  const visibleCaps = enabledCaps.slice(0, maxVisible);
  const hiddenCount = enabledCaps.length - visibleCaps.length;

  if (enabledCaps.length === 0) {
    return <span className="text-muted-foreground text-sm">No capabilities</span>;
  }

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visibleCaps.map((cap) => (
        <Badge key={cap} variant="outline" className="text-xs">
          {formatCapabilityName(cap)}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{hiddenCount} more
        </Badge>
      )}
    </div>
  );
}

// Convert snake_case or camelCase to Title Case
function formatCapabilityName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

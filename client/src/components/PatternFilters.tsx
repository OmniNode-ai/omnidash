import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PatternFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  patternType: string;
  onTypeChange: (value: string) => void;
  minQuality: number;
  onQualityChange: (value: number) => void;
  minUsage: number;
  onUsageChange: (value: number) => void;
}

export function PatternFilters({
  searchQuery,
  onSearchChange,
  patternType,
  onTypeChange,
  minQuality,
  onQualityChange,
  minUsage,
  onUsageChange
}: PatternFiltersProps) {
  const activeFiltersCount =
    (searchQuery ? 1 : 0) +
    (patternType !== 'all' ? 1 : 0) +
    (minQuality > 0 ? 1 : 0) +
    (minUsage > 0 ? 1 : 0);

  const handleClearFilters = () => {
    onSearchChange('');
    onTypeChange('all');
    onQualityChange(0);
    onUsageChange(0);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      {/* Header with clear button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filter Patterns</h3>
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-8 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear {activeFiltersCount} {activeFiltersCount === 1 ? 'filter' : 'filters'}
          </Button>
        )}
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search patterns by name or description..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pattern Type Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">Pattern Type</label>
          <Select value={patternType} onValueChange={onTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="code">Code</SelectItem>
              <SelectItem value="workflow">Workflow</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="architecture">Architecture</SelectItem>
              <SelectItem value="documentation">Documentation</SelectItem>
              <SelectItem value="error_handling">Error Handling</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quality Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Quality: {minQuality}%
          </label>
          <Slider
            value={[minQuality]}
            onValueChange={([value]) => onQualityChange(value)}
            min={0}
            max={100}
            step={5}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Usage Filter */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Min Usage: {minUsage}x
          </label>
          <Slider
            value={[minUsage]}
            onValueChange={([value]) => onUsageChange(value)}
            min={0}
            max={100}
            step={1}
            className="mt-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0x</span>
            <span>100x</span>
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {searchQuery && (
            <span className="inline-flex items-center px-2 py-1 bg-primary/10 text-primary rounded text-xs">
              Search: "{searchQuery.substring(0, 20)}{searchQuery.length > 20 ? '...' : ''}"
            </span>
          )}
          {patternType !== 'all' && (
            <span className="inline-flex items-center px-2 py-1 bg-primary/10 text-primary rounded text-xs">
              Type: {patternType}
            </span>
          )}
          {minQuality > 0 && (
            <span className="inline-flex items-center px-2 py-1 bg-primary/10 text-primary rounded text-xs">
              Quality ≥ {minQuality}%
            </span>
          )}
          {minUsage > 0 && (
            <span className="inline-flex items-center px-2 py-1 bg-primary/10 text-primary rounded text-xs">
              Usage ≥ {minUsage}x
            </span>
          )}
        </div>
      )}
    </div>
  );
}

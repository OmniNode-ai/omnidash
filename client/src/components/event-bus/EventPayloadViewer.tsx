/**
 * Event Payload Viewer Component
 * 
 * Syntax-highlighted JSON viewer for event payloads with search and copy functionality.
 */

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, CheckCircle2, Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface EventPayloadViewerProps {
  payload: Record<string, any>;
  className?: string;
}

// Security limits to prevent stack overflow and performance issues
const MAX_DEPTH = 10;
const MAX_STRING_LENGTH = 10000;

function JsonViewer({ 
  data, 
  searchTerm = '', 
  level = 0, 
  path = '',
  collapsed,
  onToggleCollapse
}: { 
  data: any; 
  searchTerm?: string; 
  level?: number;
  path?: string;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (key: string) => void;
}) {
  // Prevent stack overflow from deeply nested objects
  if (level > MAX_DEPTH) {
    return <span className="text-yellow-600">[Max depth reached]</span>;
  }

  const matchesSearch = (value: any): boolean => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();

    // Handle primitives directly - no JSON.stringify needed
    if (value === null || value === undefined) {
      return 'null'.includes(searchLower) || 'undefined'.includes(searchLower);
    }

    if (typeof value === 'string') {
      return value.toLowerCase().includes(searchLower);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).toLowerCase().includes(searchLower);
    }

    // For objects/arrays, recurse through structure - NO JSON.stringify
    // This is much faster than stringifying entire objects
    if (typeof value === 'object') {
      try {
        if (Array.isArray(value)) {
          // Check if any array element matches (recursive)
          return value.some(item => matchesSearch(item));
        }

        // For objects, check keys and recurse into values
        return Object.entries(value).some(([key, val]) =>
          key.toLowerCase().includes(searchLower) || matchesSearch(val)
        );
      } catch {
        // Handle circular references or other errors gracefully
        return false;
      }
    }

    return false;
  };

  if (!matchesSearch(data)) return null;

  if (data === null) {
    return <span className="text-gray-500">null</span>;
  }

  if (typeof data === 'string') {
    // Truncate very long strings to prevent performance issues
    const displayValue = data.length > MAX_STRING_LENGTH 
      ? `${data.slice(0, MAX_STRING_LENGTH)}... [truncated, ${data.length} chars total]`
      : data;
    return <span className="text-green-600">"{displayValue}"</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-blue-600">{data}</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-600">{data ? 'true' : 'false'}</span>;
  }

  if (Array.isArray(data)) {
    const key = path;
    const isCollapsed = collapsed[key];
    
    return (
      <div className="ml-4">
        <button
          onClick={() => onToggleCollapse(key)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand array' : 'Collapse array'}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span className="text-gray-500">[</span>
          <span className="text-gray-500">{data.length} items</span>
          <span className="text-gray-500">]</span>
        </button>
        {!isCollapsed && (
          <div className="ml-4 space-y-1">
            {data.slice(0, 100).map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-gray-500">{index}:</span>
                <JsonViewer 
                  data={item} 
                  searchTerm={searchTerm} 
                  level={level + 1} 
                  path={`${path}[${index}]`}
                  collapsed={collapsed}
                  onToggleCollapse={onToggleCollapse}
                />
              </div>
            ))}
            {data.length > 100 && (
              <div className="text-yellow-600 text-sm">
                ... [showing first 100 items of {data.length} total]
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    const key = path;
    const isCollapsed = collapsed[key];

    return (
      <div className="ml-4">
        <button
          onClick={() => onToggleCollapse(key)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand object' : 'Collapse object'}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span className="text-gray-500">{'{'}</span>
          <span className="text-gray-500">{entries.length} keys</span>
          <span className="text-gray-500">{'}'}</span>
        </button>
        {!isCollapsed && (
          <div className="ml-4 space-y-1">
            {entries.slice(0, 100).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-orange-600">"{key}"</span>
                <span className="text-gray-500">:</span>
                <JsonViewer 
                  data={value} 
                  searchTerm={searchTerm} 
                  level={level + 1} 
                  path={`${path}.${key}`}
                  collapsed={collapsed}
                  onToggleCollapse={onToggleCollapse}
                />
              </div>
            ))}
            {entries.length > 100 && (
              <div className="text-yellow-600 text-sm">
                ... [showing first 100 keys of {entries.length} total]
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

export function EventPayloadViewer({ payload, className }: EventPayloadViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Cleanup timeout on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleToggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = async () => {
    try {
      const jsonString = JSON.stringify(payload, null, 2);
      // Check size before copying to prevent browser hang (limit to ~1MB)
      if (jsonString.length > 1000000) {
        toast({
          variant: "destructive",
          title: "Payload too large",
          description: "This payload is too large to copy. Consider downloading it instead.",
        });
        return;
      }
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      // Clear any existing timeout before setting a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Failed to copy payload to clipboard. Please try again.",
      });
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Event Payload</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search payload..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-48 h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 w-full">
          <pre className="text-xs font-mono">
            <JsonViewer 
              data={payload} 
              searchTerm={searchTerm}
              collapsed={collapsed}
              onToggleCollapse={handleToggleCollapse}
            />
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


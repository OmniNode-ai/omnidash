/**
 * Event Payload Viewer Component
 * 
 * Syntax-highlighted JSON viewer for event payloads with search and copy functionality.
 */

import React, { useState } from "react";
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

function JsonViewer({ data, searchTerm = '', level = 0, path = '' }: { 
  data: any; 
  searchTerm?: string; 
  level?: number;
  path?: string;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const matchesSearch = (value: any): boolean => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const str = JSON.stringify(value).toLowerCase();
    return str.includes(searchLower);
  };

  if (!matchesSearch(data)) return null;

  if (data === null) {
    return <span className="text-gray-500">null</span>;
  }

  if (typeof data === 'string') {
    return <span className="text-green-600">"{data}"</span>;
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
          onClick={() => toggleCollapse(key)}
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
            {data.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-gray-500">{index}:</span>
                <JsonViewer data={item} searchTerm={searchTerm} level={level + 1} path={`${path}[${index}]`} />
              </div>
            ))}
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
          onClick={() => toggleCollapse(key)}
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
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-orange-600">"{key}"</span>
                <span className="text-gray-500">:</span>
                <JsonViewer data={value} searchTerm={searchTerm} level={level + 1} path={`${path}.${key}`} />
              </div>
            ))}
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
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
            <JsonViewer data={payload} searchTerm={searchTerm} />
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


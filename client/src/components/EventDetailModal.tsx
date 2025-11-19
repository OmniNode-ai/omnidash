import React, { useState } from 'react';
import { DetailModal } from './DetailModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Copy,
  CheckCircle as CheckCircleIcon,
} from 'lucide-react';

export interface EventAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails?: any;
  debugMode?: boolean;
  durationMs?: number;
  createdAt: string;
  status?: string;
  error?: string;
}

interface EventDetailModalProps {
  event: EventAction | null;
  isOpen: boolean;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="ml-2">
      {copied ? (
        <>
          <CheckCircleIcon className="w-4 h-4 mr-2" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 mr-2" />
          Copy
        </>
      )}
    </Button>
  );
}

export function EventDetailModal({ event, isOpen, onClose }: EventDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!event) return null;

  const getEventIcon = () => {
    if (event.status === 'failed' || event.error) return AlertCircle;
    if (event.status === 'completed' || event.status === 'success') return CheckCircle;
    if (event.status === 'warning') return AlertTriangle;
    return Info;
  };

  const getEventIconColor = () => {
    if (event.status === 'failed' || event.error) return 'text-red-500';
    if (event.status === 'completed' || event.status === 'success') return 'text-green-500';
    if (event.status === 'warning') return 'text-yellow-500';
    return 'text-blue-500';
  };

  const EventIcon = getEventIcon();
  const iconColor = getEventIconColor();

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Event Details"
      subtitle={`Event ID: ${event.id.length > 8 ? `${event.id.slice(0, 8)}...` : event.id}`}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Full Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <EventIcon className={`w-4 h-4 ${iconColor}`} />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${iconColor}`}>
                  {event.status
                    ? event.status.charAt(0).toUpperCase() + event.status.slice(1)
                    : 'Info'}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {event.error ? 'Failed with error' : 'Event processed'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {event.durationMs ? `${event.durationMs}ms` : 'N/A'}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {event.durationMs
                    ? event.durationMs < 100
                      ? 'Excellent'
                      : event.durationMs < 500
                        ? 'Good'
                        : 'Slow'
                    : 'No duration data'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Agent and Action Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Action Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Agent Name</div>
                  <Badge variant="default" className="text-base px-3 py-1">
                    {event.agentName}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Action Type</div>
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {event.actionType}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-2">Action Name</div>
                <div className="text-base font-medium bg-muted/30 p-3 rounded-lg">
                  {event.actionName}
                </div>
              </div>

              {event.debugMode && (
                <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-yellow-600 dark:text-yellow-400">
                    Debug Mode Enabled
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">Correlation ID</div>
                  <code className="text-xs">
                    {event.correlationId.length > 20
                      ? `${event.correlationId.slice(0, 20)}...`
                      : event.correlationId}
                  </code>
                </div>
                <div>
                  <div className="text-muted-foreground">Timestamp</div>
                  <div>{formatTimestamp(event.createdAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Error Details (if present) */}
          {event.error && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Error Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-red-500/10 p-4 rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-red-600 dark:text-red-400">
                    {event.error}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Event Data</CardTitle>
              <CardDescription>Complete event information and action details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basic Info */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Event Identifiers</div>
                  <CopyButton
                    text={JSON.stringify(
                      { id: event.id, correlationId: event.correlationId },
                      null,
                      2
                    )}
                  />
                </div>
                <div className="bg-muted/30 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Event ID:</span>
                    <code className="text-xs">{event.id}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Correlation ID:</span>
                    <code className="text-xs">{event.correlationId}</code>
                  </div>
                </div>
              </div>

              {/* Action Details */}
              {event.actionDetails && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Action Details</div>
                    <CopyButton text={JSON.stringify(event.actionDetails, null, 2)} />
                  </div>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto">
                    {JSON.stringify(event.actionDetails, null, 2)}
                  </pre>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t">
                <div className="text-sm font-medium mb-3">Event Metadata</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Agent:</span>
                    <span className="ml-2 font-medium">{event.agentName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Action Type:</span>
                    <span className="ml-2 font-medium">{event.actionType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="ml-2 font-medium">
                      {event.durationMs ? `${event.durationMs}ms` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Debug Mode:</span>
                    <span className="ml-2 font-medium">{event.debugMode ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="ml-2 font-medium">{event.status || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Timestamp:</span>
                    <span className="ml-2 font-medium">{formatTimestamp(event.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Full Event JSON */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Complete Event JSON</div>
                  <CopyButton text={JSON.stringify(event, null, 2)} />
                </div>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailModal>
  );
}

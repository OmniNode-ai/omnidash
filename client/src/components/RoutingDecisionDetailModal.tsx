import React, { useState } from 'react';
import { DetailModal } from './DetailModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Target,
  Clock,
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle,
} from 'lucide-react';

export interface RoutingDecision {
  id: string;
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  routingStrategy: string;
  alternatives?: Array<{
    agent: string;
    confidence: number;
  }>;
  reasoning?: string;
  routingTimeMs: number;
  createdAt: string;
}

interface RoutingDecisionDetailModalProps {
  decision: RoutingDecision | null;
  isOpen: boolean;
  onClose: () => void;
}

function ExpandableContent({
  fullContent,
  maxLength = 300,
}: {
  fullContent: string;
  maxLength?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = fullContent.length > maxLength;
  const displayText =
    isExpanded || !shouldTruncate ? fullContent : fullContent.slice(0, maxLength) + '...';

  return (
    <div className="space-y-2">
      <div className="text-sm">
        <pre className="whitespace-pre-wrap font-mono bg-muted p-4 rounded-lg text-xs overflow-x-auto">
          {displayText}
        </pre>
      </div>
      {shouldTruncate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              Show More
            </>
          )}
        </Button>
      )}
    </div>
  );
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
          <CheckCircle className="w-4 h-4 mr-2" />
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

export function RoutingDecisionDetailModal({
  decision,
  isOpen,
  onClose,
}: RoutingDecisionDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!decision) return null;

  const confidencePercent = (decision.confidenceScore * 100).toFixed(1);
  const confidenceColor =
    decision.confidenceScore >= 0.9
      ? 'text-green-500'
      : decision.confidenceScore >= 0.75
        ? 'text-blue-500'
        : 'text-yellow-500';

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Routing Decision Details"
      subtitle={`Decision ID: ${decision.id.length > 8 ? `${decision.id.slice(0, 8)}...` : decision.id}`}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prompt">Full Prompt</TabsTrigger>
          <TabsTrigger value="alternatives">Alternatives</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Confidence Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${confidenceColor}`}>{confidencePercent}%</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {decision.confidenceScore >= 0.9
                    ? 'Very High Confidence'
                    : decision.confidenceScore >= 0.75
                      ? 'High Confidence'
                      : 'Medium Confidence'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Routing Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{Math.round(decision.routingTimeMs)}ms</div>
                <p className="text-sm text-muted-foreground mt-2">
                  {decision.routingTimeMs < 50
                    ? 'Excellent'
                    : decision.routingTimeMs < 100
                      ? 'Good'
                      : 'Average'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Selected Agent */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Selected Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-2">Agent Name</div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-base px-3 py-1">
                    {decision.selectedAgent}
                  </Badge>
                  <Badge variant="outline">
                    {decision.routingStrategy
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Badge>
                </div>
              </div>

              {decision.reasoning && (
                <div>
                  <div className="text-sm font-medium mb-2">Routing Reasoning</div>
                  <div className="text-sm bg-muted/50 p-3 rounded-lg">{decision.reasoning}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Correlation ID</div>
                  <code className="text-xs">
                    {decision.correlationId.length > 16
                      ? `${decision.correlationId.slice(0, 16)}...`
                      : decision.correlationId}
                  </code>
                </div>
                <div>
                  <div className="text-muted-foreground">Timestamp</div>
                  <div>{new Date(decision.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Request Summary */}
          <Card>
            <CardHeader>
              <CardTitle>User Request</CardTitle>
              <CardDescription>The query that triggered this routing decision</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm leading-relaxed">{decision.userRequest}</p>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm">
                  View Full Prompt
                </Button>
                <CopyButton text={decision.userRequest} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Prompt Received by Router</CardTitle>
              <CardDescription>
                Complete prompt that was analyzed by the agent routing system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">User Request</div>
                  <CopyButton text={decision.userRequest} />
                </div>
                <ExpandableContent fullContent={decision.userRequest} maxLength={500} />
              </div>

              {decision.reasoning && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Router Analysis</div>
                    <CopyButton text={decision.reasoning} />
                  </div>
                  <div className="text-sm bg-muted/50 p-4 rounded-lg">{decision.reasoning}</div>
                </div>
              )}

              <div className="pt-4 border-t">
                <div className="text-sm font-medium mb-2">Routing Metadata</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strategy:</span>
                    <span className="ml-2 font-medium">
                      {decision.routingStrategy.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Processing Time:</span>
                    <span className="ml-2 font-medium">{Math.round(decision.routingTimeMs)}ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="ml-2 font-medium">{confidencePercent}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Alternatives:</span>
                    <span className="ml-2 font-medium">
                      {decision.alternatives?.length || 0} considered
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alternatives" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Alternative Agents Considered
              </CardTitle>
              <CardDescription>
                Other agents that were evaluated but not selected for this request
              </CardDescription>
            </CardHeader>
            <CardContent>
              {decision.alternatives && decision.alternatives.length > 0 ? (
                <div className="space-y-3">
                  {decision.alternatives.map((alt, idx) => {
                    const altConfidencePercent = (alt.confidence * 100).toFixed(1);
                    const difference = ((decision.confidenceScore - alt.confidence) * 100).toFixed(
                      1
                    );

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                      >
                        <div className="flex-1">
                          <div className="font-medium">{alt.agent}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Rank #{idx + 2} alternative
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">{altConfidencePercent}%</div>
                          <div className="text-xs text-muted-foreground">
                            -{difference}% vs selected
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No alternative agents were considered</p>
                  <p className="text-xs mt-2">
                    The selected agent had overwhelming confidence for this request
                  </p>
                </div>
              )}

              {decision.alternatives && decision.alternatives.length > 0 && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-sm font-medium mb-2">
                    Why was {decision.selectedAgent} chosen?
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {decision.selectedAgent} had the highest confidence score of {confidencePercent}
                    %, which was{' '}
                    {(
                      (decision.confidenceScore - (decision.alternatives[0]?.confidence || 0)) *
                      100
                    ).toFixed(1)}
                    % higher than the next best alternative.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailModal>
  );
}

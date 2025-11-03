import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
}

interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
}

export function ChatInterface() {
  // Mock chat history for now - replace with real API when available
  const { data: chatHistory, isLoading, error } = useQuery<ChatHistoryResponse>({
    queryKey: ['chat-history'],
    queryFn: async () => {
      // Mock data for demonstration
      // Preload with 3 smart Q&A pairs for demo
      const now = new Date();
      return {
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'How can I reduce token usage and costs for my AI agents?',
            timestamp: new Date(now.getTime() - 7200000).toISOString() // 2 hours ago
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Based on your current agent performance data, I can see several cost optimization opportunities:\n\n1. **Pattern Injection**: Your system has identified 125 proven patterns that can reduce token usage by up to 34%. The Polymorphic Agent shows the highest savings potential.\n\n2. **Smart Routing**: Your routing accuracy is at 94.2%, but optimizing routing decisions can reduce unnecessary API calls by 8%.\n\n3. **Local Compute Offload**: Moving computation-intensive tasks to local processing can save 12% on API costs.\n\n4. **Cache Frequently Used Responses**: Your cache hit rate is currently 67%. Increasing this to 80%+ could save an additional $450/month.\n\nWould you like me to generate a detailed cost optimization plan for your specific agents?',
            timestamp: new Date(now.getTime() - 7195000).toISOString()
          },
          {
            id: '3',
            role: 'user',
            content: 'What patterns should I use for error handling in my microservices?',
            timestamp: new Date(now.getTime() - 3600000).toISOString() // 1 hour ago
          },
          {
            id: '4',
            role: 'assistant',
            content: 'For microservices error handling, I recommend implementing these proven patterns from your codebase:\n\n1. **Circuit Breaker Pattern**: I found 3 implementations in your codebase. The best one is in `/src/middleware/circuit_breaker.py` with a quality score of 9.2.\n\n2. **Retry with Exponential Backoff**: Found 2 implementations. The pattern in `/src/utils/retry_handler.py` is actively used by 45 services.\n\n3. **Dead Letter Queue**: Pattern available in `/src/queue/dlq_handler.py` with 98% success rate.\n\n4. **Centralized Error Logging**: Your current implementation in `/src/logging/error_handler.py` uses correlation IDs and shows excellent traceability.\n\n5. **Graceful Degradation**: Pattern in `/src/services/fallback_handler.py` is proven and can be injected into 12 agents.\n\nI can help you standardize these patterns across all your services. Which pattern would you like to start with?',
            timestamp: new Date(now.getTime() - 3595000).toISOString()
          },
          {
            id: '5',
            role: 'user',
            content: 'How do I identify and fix duplicate code across my repositories?',
            timestamp: new Date(now.getTime() - 1800000).toISOString() // 30 min ago
          },
          {
            id: '6',
            role: 'assistant',
            content: 'I can help you identify and refactor duplicate code! Based on your codebase analysis:\n\n**Current Status:**\n- Found 15 duplicate clusters across 8 repositories\n- Total duplicate code: 8% of codebase\n- Estimated refactoring time: 42 hours\n- Potential savings: $12,000/year in maintenance costs\n\n**Top Duplicates to Fix:**\n1. **Authentication Flow** (3 implementations) - Best: `/auth/oauth_handler.py` (Quality: 9.1)\n2. **Database Connection Pool** (4 implementations) - Best: `/db/pool_manager.py` (Quality: 8.9)\n3. **Error Handling Middleware** (5 implementations) - Best: `/middleware/error_handler.py` (Quality: 8.7)\n\n**Recommended Action:**\nI can generate a prioritized refactoring plan that:\n- Marks the best implementation in each cluster\n- Provides step-by-step migration guide\n- Estimates time and ROI for each refactoring\n\nWould you like me to generate the refactoring plan for the top 3 duplicates?',
            timestamp: new Date(now.getTime() - 1795000).toISOString()
          }
        ]
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });

  // Transform API response to conversations format
  const conversations: Conversation[] = chatHistory?.messages
    ? chatHistory.messages.reduce<Conversation[]>((acc, msg) => {
        // Group messages by conversation (simple approach: one message per conversation for now)
        const conversation: Conversation = {
          id: msg.id,
          title: msg.role === 'user' ? msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '') : 'Response',
          messages: [{
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          }],
          timestamp: new Date(msg.timestamp),
        };
        return [...acc, conversation];
      }, [])
    : [];

  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const currentConversation = conversations.find(c => c.id === activeConversation);

  const handleSend = () => {
    if (!input.trim()) return;
    // TODO: Implement sending new messages to omniarchon API
    // For now, just clear the input as we're displaying read-only history
    setInput("");
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Card className="p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Loading Chat History</h3>
            <p className="text-sm text-muted-foreground">Fetching conversations from omniarchon...</p>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Card className="p-8 flex flex-col items-center gap-4 max-w-md">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Failed to Load Chat History</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'Could not connect to omniarchon service at http://localhost:8053'}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
      {/* History Sidebar */}
      <Card className="p-4 xl:col-span-1">
        <div className="mb-4">
          <h3 className="text-base font-semibold mb-3">Chat History</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-history"
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-6rem)]">
          <div className="space-y-2">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "p-3 rounded-lg cursor-pointer hover-elevate active-elevate-2 border",
                  activeConversation === conv.id 
                    ? "border-primary bg-primary/5" 
                    : "border-card-border"
                )}
                onClick={() => setActiveConversation(conv.id)}
                data-testid={`conversation-${conv.id}`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {conv.timestamp.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      <Card className="xl:col-span-3 flex flex-col">
        <div className="p-6 border-b border-card-border">
          <h3 className="text-lg font-semibold">AI Query Assistant</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Ask questions about your platform metrics and operations
          </p>
        </div>

        <ScrollArea className="flex-1 p-6">
          {currentConversation ? (
            <div className="space-y-4">
              {currentConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] p-4 rounded-lg",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary"
                    )}
                  >
                    <div className="text-sm">{message.content}</div>
                    <div className={cn(
                      "text-xs mt-2",
                      message.role === "user" 
                        ? "text-primary-foreground/70" 
                        : "text-muted-foreground"
                    )}>
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
              <h4 className="text-lg font-semibold mb-2">Start a New Conversation</h4>
              <p className="text-sm text-muted-foreground max-w-md">
                Ask about agent status, pattern insights, system health, or any metrics from your platform
              </p>
              <div className="flex flex-wrap gap-2 mt-6">
                <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInput("Show me agents with high error rates")}>
                  Show me agents with high error rates
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInput("What's the current system health?")}>
                  What's the current system health?
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInput("Top performing patterns today")}>
                  Top performing patterns today
                </Badge>
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t border-card-border">
          <div className="flex gap-2">
            <Input
              placeholder="Ask about your platform metrics..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              data-testid="input-chat-message"
            />
            <Button onClick={handleSend} data-testid="button-send-message">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

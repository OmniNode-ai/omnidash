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
      return {
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'How can I improve the performance of my API endpoints?',
            timestamp: '2024-01-20T10:30:00Z'
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Based on your current system metrics, I can see several optimization opportunities:\n\n1. **Database Query Optimization**: Your query response times are averaging 150ms. Consider adding indexes on frequently queried columns.\n\n2. **Caching Strategy**: Implement Redis caching for frequently accessed data.\n\n3. **Connection Pooling**: Your database connection pool utilization is at 85%. Consider increasing the pool size.\n\n4. **API Response Compression**: Enable gzip compression to reduce payload size.\n\nWould you like me to generate specific optimization recommendations for your codebase?',
            timestamp: '2024-01-20T10:30:15Z'
          },
          {
            id: '3',
            role: 'user',
            content: 'What patterns should I use for error handling in my microservices?',
            timestamp: '2024-01-20T11:15:00Z'
          },
          {
            id: '4',
            role: 'assistant',
            content: 'For microservices error handling, I recommend implementing these patterns:\n\n1. **Circuit Breaker Pattern**: Prevent cascade failures by breaking the circuit when downstream services fail.\n\n2. **Retry with Exponential Backoff**: Implement intelligent retry logic with increasing delays.\n\n3. **Dead Letter Queue**: Route failed messages to a DLQ for later processing.\n\n4. **Centralized Error Logging**: Use structured logging with correlation IDs for traceability.\n\n5. **Graceful Degradation**: Provide fallback responses when non-critical services are unavailable.\n\nI can help you implement these patterns in your current architecture. Which service would you like to start with?',
            timestamp: '2024-01-20T11:15:30Z'
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

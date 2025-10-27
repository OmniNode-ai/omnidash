import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquare } from "lucide-react";
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

export function ChatInterface() {
  //todo: remove mock functionality
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: 'Show me all agents with errors',
      messages: [
        { id: '1', role: 'user', content: 'Show me all agents with errors', timestamp: new Date(Date.now() - 3600000) },
        { id: '2', role: 'assistant', content: 'I found 3 agents with errors: Agent-7, Agent-15, and Agent-23. Would you like detailed information about any of them?', timestamp: new Date(Date.now() - 3590000) },
      ],
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      id: '2',
      title: 'What patterns were discovered today?',
      messages: [
        { id: '1', role: 'user', content: 'What patterns were discovered today?', timestamp: new Date(Date.now() - 7200000) },
        { id: '2', role: 'assistant', content: 'Today we discovered 342 new patterns. The top categories are: React Hooks (87), API Optimization (64), State Management (52), and Error Handling (43).', timestamp: new Date(Date.now() - 7190000) },
      ],
      timestamp: new Date(Date.now() - 7200000),
    },
  ]);

  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const currentConversation = conversations.find(c => c.id === activeConversation);

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    if (activeConversation) {
      setConversations(prev => prev.map(conv => 
        conv.id === activeConversation 
          ? { ...conv, messages: [...conv.messages, newMessage] }
          : conv
      ));
    } else {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: input.slice(0, 50) + (input.length > 50 ? '...' : ''),
        messages: [newMessage],
        timestamp: new Date(),
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
    }

    setInput("");

    // Simulate response
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I've analyzed your query. Here's what I found based on the current platform state...",
        timestamp: new Date(),
      };

      setConversations(prev => prev.map(conv => 
        conv.id === (activeConversation || Date.now().toString())
          ? { ...conv, messages: [...conv.messages, response] }
          : conv
      ));
    }, 1000);
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

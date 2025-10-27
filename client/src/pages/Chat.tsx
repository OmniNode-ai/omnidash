import { ChatInterface } from "@/components/ChatInterface";

export default function Chat() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">AI Query Assistant</h1>
        <p className="text-muted-foreground">Ask questions about your platform using natural language</p>
      </div>

      <ChatInterface />
    </div>
  );
}

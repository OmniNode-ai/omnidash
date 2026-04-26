import { Text } from '@/components/ui/typography';

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const SUGGESTED_PROMPTS = [
  'Start from the Platform Health template',
  'Add a cost trend panel and delegation metrics side by side',
  'Filter everything to last 7 days',
  'Switch to dark mode',
];

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
      {SUGGESTED_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          style={{
            textAlign: 'left',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'transparent',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
          }}
        >
          <Text size="lg" color="inherit" leading="normal">{prompt}</Text>
        </button>
      ))}
    </div>
  );
}

// Floating "AI" launcher button that opens/closes the chat panel —
// extracted from `AgentOrchestrator.tsx` (OMN-119) so it can be
// rendered in Storybook in isolation.
//
// IMPORTANT: the styling here is the existing in-tree styling, kept
// verbatim during the extraction so we don't conflate "story
// coverage" with "visual redesign." The orb does not currently match
// the Claude Design prototype; that's tracked separately as a
// follow-up. See OMN-119 ticket comments for the redesign ticket id.
import { Text } from '@/components/ui/typography';

export interface AgentLauncherProps {
  /** Whether the chat panel is currently open. Reserved for active-state styling
   *  the prototype is expected to introduce; today this prop is accepted but
   *  not yet visually distinguished, matching pre-OMN-119 behavior. */
  isOpen: boolean;
  onClick: () => void;
}

export function AgentLauncher({ isOpen, onClick }: AgentLauncherProps) {
  return (
    <button
      onClick={onClick}
      aria-label="AI Assistant"
      aria-pressed={isOpen}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: 'hsl(var(--primary))',
        color: 'hsl(var(--primary-foreground))',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 99,
      }}
    >
      <Text size="3xl" color="inherit" weight="semibold">AI</Text>
    </button>
  );
}

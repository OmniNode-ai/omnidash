import { useState, useCallback, type FormEvent } from 'react';
import { Text } from '@/components/ui/typography';
import './control-plane.css';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  status?: 'idle' | 'submitting' | 'accepted' | 'error';
  feedback?: string;
}

export function PromptInput({
  onSubmit,
  disabled,
  status = 'idle',
  feedback,
}: PromptInputProps) {
  const [value, setValue] = useState('');
  const isSubmitting = status === 'submitting';

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue('');
    },
    [value, onSubmit],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <form
        onSubmit={handleSubmit}
        className="control-plane-prompt-form"
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe the node to generate..."
          disabled={disabled || isSubmitting}
          className="control-plane-prompt-input"
        />
        <button
          type="submit"
          disabled={disabled || isSubmitting || !value.trim()}
          className="btn primary"
          aria-label="Generate"
        >
          {isSubmitting ? 'Submitting...' : 'Generate'}
        </button>
      </form>
      {feedback && (
        <Text
          as="div"
          size="xs"
          color={status === 'error' ? 'bad' : status === 'accepted' ? 'ok' : 'secondary'}
          role="status"
          aria-live="polite"
          className="control-plane-submit-feedback"
        >
          {feedback}
        </Text>
      )}
    </div>
  );
}

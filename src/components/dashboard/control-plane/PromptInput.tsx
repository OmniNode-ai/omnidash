import { useState, useCallback, type FormEvent } from 'react';
import './control-plane.css';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

export function PromptInput({ onSubmit, disabled }: PromptInputProps) {
  const [value, setValue] = useState('');

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
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 0',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe the node to generate..."
        disabled={disabled}
        className="control-plane-prompt-input"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="btn primary"
        aria-label="Generate"
      >
        Generate
      </button>
    </form>
  );
}

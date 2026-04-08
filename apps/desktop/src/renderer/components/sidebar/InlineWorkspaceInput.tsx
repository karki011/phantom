/**
 * InlineWorkspaceInput — compact inline text input for creating workspaces
 * Appears inside a ProjectSection when user clicks "+"
 *
 * @author Subash Karki
 */
import { TextInput } from '@mantine/core';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorkspaceAtom } from '../../atoms/workspaces';

interface InlineWorkspaceInputProps {
  projectId: string;
  onDone: () => void;
}

export function InlineWorkspaceInput({
  projectId,
  onDone,
}: InlineWorkspaceInputProps) {
  const createWorkspace = useSetAtom(createWorkspaceAtom);
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus when shown
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const branch = value.trim();
    if (!branch || submitting) return;
    setSubmitting(true);
    try {
      await createWorkspace({ projectId, branch });
      onDone();
    } catch {
      // Error handled at atom level
    } finally {
      setSubmitting(false);
    }
  }, [value, projectId, createWorkspace, onDone, submitting]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      }
    },
    [handleSubmit, onDone],
  );

  return (
    <div style={{ padding: '2px 8px 4px' }}>
      <TextInput
        ref={inputRef}
        placeholder="branch name..."
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Small delay to allow Enter to fire first
          setTimeout(() => {
            if (!submitting) onDone();
          }, 150);
        }}
        disabled={submitting}
        size="xs"
        styles={{
          input: {
            height: 28,
            minHeight: 28,
            fontSize: '0.75rem',
            backgroundColor: 'var(--phantom-surface-bg)',
            borderColor: 'var(--phantom-border-subtle)',
            color: 'var(--phantom-text-primary)',
            '&::placeholder': {
              color: 'var(--phantom-text-muted)',
            },
          },
        }}
      />
    </div>
  );
}

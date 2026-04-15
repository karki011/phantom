// apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx
// Author: Subash Karki

import { Button, Group, Kbd, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

import { fetchGitIdentity } from '../../../lib/api';

/* ────────────────────────── types ────────────────────────── */

export interface OperatorResult {
  operatorName: string;
  gitName: string;
  gitEmail: string;
}

interface Props {
  onComplete: (result: OperatorResult) => void;
}

/* ────────────────────────── helpers ────────────────────────── */

function firstNameFrom(fullName: string): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

/* ────────────────────────── component ────────────────────── */

export function OperatorPhase({ onComplete }: Props) {
  const [gitName, setGitName] = useState<string | null>(null);
  const [gitEmail, setGitEmail] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* Load git identity on mount */
  useEffect(() => {
    fetchGitIdentity().then(({ name, email }) => {
      setGitName(name ?? '');
      setGitEmail(email ?? '');
      setHandle(firstNameFrom(name ?? ''));
    });
  }, []);

  /* Don't render until git identity is loaded */
  if (gitName === null) return null;

  const handleSubmit = () => {
    const trimmed = handle.trim();
    if (!trimmed) return;
    onComplete({
      operatorName: trimmed,
      gitName: gitName,
      gitEmail: gitEmail ?? '',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  /* ─────── styles ─────── */

  const monoFont = 'var(--phantom-font-mono, monospace)';
  const cyan = 'var(--phantom-accent-cyan, #00d4ff)';
  const gold = 'var(--phantom-accent-gold, #f59e0b)';
  const dimText = 'rgba(255,255,255,0.45)';

  return (
    <Stack
      gap="lg"
      style={{
        width: '100%',
        maxWidth: 440,
        fontFamily: monoFont,
      }}
    >
      {/* Section label */}
      <Text
        size="xs"
        style={{
          fontFamily: monoFont,
          color: gold,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        // OPERATOR IDENTIFICATION
      </Text>

      {/* Git identity read-only block */}
      {(gitName || gitEmail) && (
        <Stack gap={4}>
          <Text
            size="xs"
            style={{
              fontFamily: monoFont,
              color: dimText,
              letterSpacing: '0.06em',
            }}
          >
            git config detected:
          </Text>
          {gitName && (
            <Text
              size="sm"
              style={{
                fontFamily: monoFont,
                color: cyan,
                paddingLeft: 12,
              }}
            >
              name&nbsp;&nbsp;→&nbsp;&nbsp;{gitName}
            </Text>
          )}
          {gitEmail && (
            <Text
              size="sm"
              style={{
                fontFamily: monoFont,
                color: cyan,
                paddingLeft: 12,
              }}
            >
              email&nbsp;&nbsp;→&nbsp;&nbsp;{gitEmail}
            </Text>
          )}
        </Stack>
      )}

      {/* Operator handle input */}
      <TextInput
        ref={inputRef}
        autoFocus
        value={handle}
        onChange={(e) => setHandle(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        label={
          <Text
            component="span"
            size="xs"
            style={{
              fontFamily: monoFont,
              color: gold,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Operator Handle
          </Text>
        }
        description={
          <Text
            component="span"
            size="xs"
            style={{
              fontFamily: monoFont,
              color: dimText,
            }}
          >
            The name you go by in the system
          </Text>
        }
        placeholder="e.g. Subash"
        styles={{
          input: {
            fontFamily: monoFont,
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${cyan}`,
            color: '#ffffff',
            caretColor: cyan,
            '&:focus': {
              borderColor: cyan,
              boxShadow: `0 0 0 1px ${cyan}`,
            },
          },
          wrapper: {
            marginTop: 4,
          },
        }}
      />

      {/* Submit button */}
      <Group justify="flex-start">
        <Button
          onClick={handleSubmit}
          disabled={!handle.trim()}
          variant="outline"
          styles={{
            root: {
              fontFamily: monoFont,
              borderColor: cyan,
              color: cyan,
              background: 'transparent',
              letterSpacing: '0.06em',
              '&:hover:not(:disabled)': {
                background: 'rgba(0,212,255,0.08)',
              },
              '&:disabled': {
                borderColor: 'rgba(0,212,255,0.3)',
                color: 'rgba(0,212,255,0.3)',
              },
            },
          }}
        >
          [ Confirm ]
        </Button>
        <Kbd
          style={{
            fontFamily: monoFont,
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid rgba(255,255,255,0.15)`,
            color: dimText,
            fontSize: 11,
          }}
        >
          Enter ↵
        </Kbd>
      </Group>
    </Stack>
  );
}

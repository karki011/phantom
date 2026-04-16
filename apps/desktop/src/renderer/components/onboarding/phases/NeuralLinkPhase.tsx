// apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx
// Author: Subash Karki

import { Button, Group, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';

/* ────────────────────────── types ────────────────────────── */

export interface NeuralLinkResult {
  claudeMcpEnabled: boolean;
  claudeInstructionsEnabled: boolean;
  claudeHooksEnabled: boolean;
}

interface Props {
  claudeDetected: boolean;
  onComplete: (result: NeuralLinkResult) => void;
}

/* ────────────────────────── sub-component ────────────────── */

interface ToggleRowProps {
  label: string;
  description: string;
  recommended: boolean;
  checked: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
}

function ToggleRow({
  label,
  description,
  recommended,
  checked,
  disabled,
  onChange,
}: ToggleRowProps) {
  const monoFont = 'var(--phantom-font-mono, monospace)';
  const gold = 'var(--phantom-accent-gold, #f59e0b)';
  const cyan = 'var(--phantom-accent-cyan, #00d4ff)';
  const dimText = 'rgba(255,255,255,0.45)';

  return (
    <Group
      justify="space-between"
      align="flex-start"
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {/* Left: label + badge + description */}
      <Stack gap={4} style={{ flex: 1 }}>
        <Group gap={8} align="center">
          <Text
            size="sm"
            style={{
              fontFamily: monoFont,
              color: '#ffffff',
              fontWeight: 500,
            }}
          >
            {label}
          </Text>
          {recommended && (
            <Text
              size="xs"
              style={{
                fontFamily: monoFont,
                color: gold,
                border: `1px solid ${gold}`,
                borderRadius: 4,
                padding: '1px 5px',
                lineHeight: 1.4,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              recommended
            </Text>
          )}
        </Group>
        <Text
          size="xs"
          style={{
            fontFamily: monoFont,
            color: dimText,
            lineHeight: 1.5,
          }}
        >
          {description}
        </Text>
      </Stack>

      {/* Right: switch */}
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        styles={{
          track: {
            background: checked ? cyan : 'rgba(255,255,255,0.12)',
            borderColor: checked ? cyan : 'rgba(255,255,255,0.2)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          },
        }}
      />
    </Group>
  );
}

/* ────────────────────────── component ────────────────────── */

export function NeuralLinkPhase({ claudeDetected, onComplete }: Props) {
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [instructionsEnabled, setInstructionsEnabled] = useState(true);
  const [hooksEnabled, setHooksEnabled] = useState(true);

  const monoFont = 'var(--phantom-font-mono, monospace)';
  const cyan = 'var(--phantom-accent-cyan, #00d4ff)';
  const gold = 'var(--phantom-accent-gold, #f59e0b)';
  const errorColor = 'var(--phantom-status-error, #ef4444)';
  const dimText = 'rgba(255,255,255,0.45)';

  const handleAuthorize = () => {
    onComplete({
      claudeMcpEnabled: mcpEnabled,
      claudeInstructionsEnabled: instructionsEnabled,
      claudeHooksEnabled: hooksEnabled,
    });
  };

  return (
    <Stack
      gap="lg"
      style={{
        width: '100%',
        maxWidth: 500,
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
        // NEURAL LINK — CLAUDE AI INTEGRATION
      </Text>

      {/* Explanation */}
      <Text
        size="sm"
        style={{
          fontFamily: monoFont,
          color: dimText,
          lineHeight: 1.6,
        }}
      >
        phantom-ai connects Claude Code to your dependency graph. When enabled,
        Claude will check which files depend on each other before making edits —
        reducing accidental breakage across your codebase.
      </Text>

      {/* Warning: Claude not detected */}
      {!claudeDetected && (
        <Stack
          gap={6}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${errorColor}`,
            background: 'rgba(239,68,68,0.08)',
          }}
        >
          <Text
            size="xs"
            style={{
              fontFamily: monoFont,
              color: errorColor,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            ⚠ Claude Code not detected
          </Text>
          <Text
            size="xs"
            style={{
              fontFamily: monoFont,
              color: errorColor,
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Claude Code was not found on this system. Your selections will be
            saved and applied automatically once Claude Code is installed.
          </Text>
        </Stack>
      )}

      {/* Toggle rows */}
      <Stack gap={8}>
        <ToggleRow
          label="Register MCP server"
          description="Adds phantom-ai to ~/.mcp.json so Claude can use your dependency graph"
          recommended={true}
          checked={mcpEnabled}
          disabled={!claudeDetected}
          onChange={setMcpEnabled}
        />
        <ToggleRow
          label="Project instructions"
          description="Adds guidance to ~/.claude/projects/ so Claude checks dependencies before editing"
          recommended={true}
          checked={instructionsEnabled}
          disabled={!claudeDetected}
          onChange={setInstructionsEnabled}
        />
        <ToggleRow
          label="Pre-edit hook"
          description="Adds a reminder hook so Claude doesn't skip the graph"
          recommended={false}
          checked={hooksEnabled}
          disabled={!claudeDetected}
          onChange={setHooksEnabled}
        />
      </Stack>

      {/* Submit */}
      <Group justify="flex-start">
        <Button
          onClick={handleAuthorize}
          variant="outline"
          styles={{
            root: {
              fontFamily: monoFont,
              borderColor: cyan,
              color: cyan,
              background: 'transparent',
              letterSpacing: '0.06em',
              '&:hover': {
                background: 'rgba(0,212,255,0.08)',
              },
            },
          }}
        >
          [ Authorize ]
        </Button>
      </Group>
    </Stack>
  );
}

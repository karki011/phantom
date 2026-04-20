/**
 * EnrichmentWidget — floating bottom-right progress indicator for background
 * graph builds. Onboarding terminal aesthetic: monospace, cyan glow, dark bg.
 * Collapsed by default, expandable to see per-project status.
 * Auto-dismisses when queue empties.
 *
 * @author Subash Karki
 */
import { Group, Paper, Progress, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { Check, ChevronDown, ChevronUp, Loader2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  enrichmentActiveAtom,
  enrichmentStateAtom,
} from '../atoms/enrichment';

const MONO_FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";
const CYAN = '#00d4ff';
const GREEN = '#22c55e';
const RED = '#ef4444';
const GOLD = '#f59e0b';

export function EnrichmentWidget() {
  const state = useAtomValue(enrichmentStateAtom);
  const isActive = useAtomValue(enrichmentActiveAtom);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCompleted = useRef(0);

  // Auto-expand on first activity
  useEffect(() => {
    if (isActive && state.total > 0) {
      setDismissed(false);
    }
  }, [isActive, state.total]);

  // Auto-dismiss 5s after completion
  useEffect(() => {
    if (!isActive && state.total > 0 && state.completed === state.total) {
      const timer = setTimeout(() => setDismissed(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isActive, state.total, state.completed]);

  // Auto-scroll list when new items complete
  useEffect(() => {
    if (state.completed > prevCompleted.current && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-status="building"]');
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCompleted.current = state.completed;
  }, [state.completed]);

  if (dismissed || state.total === 0) return null;

  const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
  const isDone = state.completed === state.total;
  const items = [...state.items.values()];

  return (
    <Paper
      shadow="xl"
      radius="md"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        fontFamily: MONO_FONT,
        backgroundColor: 'rgba(10, 10, 20, 0.95)',
        border: `1px solid ${isDone ? `${GREEN}33` : `${CYAN}26`}`,
        backdropFilter: 'blur(16px)',
        width: expanded ? 340 : 260,
        overflow: 'hidden',
        transition: 'width 200ms ease, border-color 300ms ease',
      }}
    >
      {/* Header — always visible, clickable to toggle */}
      <UnstyledButton
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          width: '100%',
          borderBottom: expanded ? `1px solid ${CYAN}1a` : 'none',
        }}
      >
        <Zap
          size={14}
          style={{
            color: isDone ? GREEN : GOLD,
            filter: `drop-shadow(0 0 4px ${isDone ? GREEN : GOLD}66)`,
          }}
        />
        <Text
          fz="0.75rem"
          fw={700}
          style={{
            color: isDone ? GREEN : CYAN,
            textShadow: `0 0 8px ${isDone ? GREEN : CYAN}66`,
            flex: 1,
          }}
        >
          {isDone ? 'GRAPHS COMPLETE' : 'BUILDING GRAPHS'}
        </Text>
        <Text fz="0.72rem" fw={600} style={{ color: 'rgba(255,255,255,0.5)' }}>
          {state.completed}/{state.total}
        </Text>
        {expanded
          ? <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
          : <ChevronUp size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
        }
      </UnstyledButton>

      {/* Progress bar */}
      <div style={{ padding: '0 14px', paddingBottom: expanded ? 0 : 10 }}>
        <Progress
          value={pct}
          size={3}
          radius="xs"
          color={isDone ? GREEN : CYAN}
          styles={{
            root: { backgroundColor: `${CYAN}1a`, marginTop: 2 },
            section: {
              boxShadow: `0 0 8px ${isDone ? GREEN : CYAN}66`,
              transition: 'width 400ms ease',
            },
          }}
        />
      </div>

      {/* Expanded: per-project list */}
      {expanded && (
        <div style={{ padding: '8px 14px 12px' }}>
          {/* Active projects label */}
          {state.active.length > 0 && !isDone && (
            <Text fz="0.65rem" c={GOLD} fw={600} mb={6} style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {state.active.length} active
            </Text>
          )}

          <ScrollArea.Autosize mah={200} ref={listRef} scrollbarSize={4}>
            <Stack gap={1}>
              {items.map((item) => (
                <Group
                  key={item.projectId}
                  gap={6}
                  wrap="nowrap"
                  data-status={item.status}
                  style={{
                    padding: '3px 0',
                    opacity: item.status === 'queued' ? 0.35 : 1,
                    transition: 'opacity 200ms',
                  }}
                >
                  {item.status === 'complete' && (
                    <Check size={10} style={{ color: GREEN, flexShrink: 0, filter: `drop-shadow(0 0 3px ${GREEN}66)` }} />
                  )}
                  {item.status === 'error' && (
                    <X size={10} style={{ color: RED, flexShrink: 0, filter: `drop-shadow(0 0 3px ${RED}66)` }} />
                  )}
                  {item.status === 'building' && (
                    <Loader2 size={10} style={{ color: CYAN, flexShrink: 0, animation: 'spin 1s linear infinite', filter: `drop-shadow(0 0 3px ${CYAN}66)` }} />
                  )}
                  {item.status === 'queued' && (
                    <div style={{ width: 10, height: 10, flexShrink: 0 }} />
                  )}
                  <Text
                    fz="0.68rem"
                    truncate
                    style={{
                      color: item.status === 'complete'
                        ? GREEN
                        : item.status === 'error'
                          ? RED
                          : item.status === 'building'
                            ? CYAN
                            : 'rgba(255,255,255,0.35)',
                      textShadow: item.status === 'building'
                        ? `0 0 6px ${CYAN}44`
                        : item.status === 'complete'
                          ? `0 0 4px ${GREEN}33`
                          : 'none',
                    }}
                  >
                    {item.projectName}
                  </Text>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>

          {/* Footer stats */}
          <Group justify="space-between" mt={8}>
            <Text fz="0.6rem" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {state.active.length} active · {state.completed} done · {state.total - state.completed - state.active.length} queued
            </Text>
            {isDone && (
              <UnstyledButton
                onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
                style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}
              >
                dismiss
              </UnstyledButton>
            )}
          </Group>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Paper>
  );
}

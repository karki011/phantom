// apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx
// Author: Subash Karki

import { Button, Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useSetAtom } from 'jotai';
import { useState } from 'react';

import { FONT_FAMILY_OPTIONS, fontFamilyAtom, themeNameAtom } from '../../../atoms/system';
import type { FontFamily } from '../../../atoms/system';
import { themeRegistry } from '@phantom-os/theme';

/* ────────────────────────── types ────────────────────────── */

export interface DisplayResult {
  theme: string;
  fontFamily: FontFamily;
}

interface Props {
  onComplete: (result: DisplayResult) => void;
}

/* ────────────────────────── component ────────────────────── */

export function DisplayPhase({ onComplete }: Props) {
  const [selectedTheme, setSelectedTheme] = useState<string>('cz-dark');
  const [selectedFont, setSelectedFont] = useState<FontFamily>('jetbrains-mono');

  const setThemeName = useSetAtom(themeNameAtom);
  const setFontFamily = useSetAtom(fontFamilyAtom);

  /* ─────── style constants ─────── */
  const monoFont = 'var(--phantom-font-mono, monospace)';
  const cyan = 'var(--phantom-accent-cyan, #00d4ff)';
  const gold = 'var(--phantom-accent-gold, #f59e0b)';
  const dimText = 'rgba(255,255,255,0.45)';

  /* ─────── theme selection ─────── */
  const handleThemeSelect = (themeName: string) => {
    setSelectedTheme(themeName);
    setThemeName(themeName);
  };

  /* ─────── font selection ─────── */
  const handleFontSelect = (font: FontFamily) => {
    setSelectedFont(font);
    setFontFamily(font);
  };

  /* ─────── apply ─────── */
  const handleApply = () => {
    onComplete({ theme: selectedTheme, fontFamily: selectedFont });
  };

  return (
    <Stack
      gap="xl"
      style={{
        maxWidth: 520,
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
        // DISPLAY CALIBRATION
      </Text>

      {/* ── Theme Grid ── */}
      <Stack gap="sm">
        <Text
          size="xs"
          style={{
            fontFamily: monoFont,
            color: dimText,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          select theme
        </Text>

        <SimpleGrid cols={2} spacing="sm">
          {themeRegistry.map((theme) => {
            const vars = theme.cssVars.dark;
            const accentColor = vars['--phantom-accent-glow'] ?? cyan;
            const bgColor = vars['--phantom-surface-bg'] ?? '#0d0d10';
            const isSelected = selectedTheme === theme.name;

            const swatches: Array<{ color: string; label: string }> = [
              { color: accentColor, label: 'accent' },
              { color: bgColor, label: 'bg' },
              { color: '#e0e0e0', label: 'text' },
              { color: 'rgba(255,255,255,0.1)', label: 'muted' },
            ];

            return (
              <UnstyledButton
                key={theme.name}
                onClick={() => handleThemeSelect(theme.name)}
                style={{
                  background: bgColor,
                  border: isSelected
                    ? `2px solid ${accentColor}`
                    : '2px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <Stack gap={8}>
                  {/* Theme name */}
                  <Text
                    size="xs"
                    style={{
                      fontFamily: monoFont,
                      color: accentColor,
                      letterSpacing: '0.06em',
                      fontWeight: 600,
                    }}
                  >
                    {theme.name}
                  </Text>

                  {/* Color swatches */}
                  <Group gap={6}>
                    {swatches.map((swatch) => (
                      <div
                        key={swatch.label}
                        title={swatch.label}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          background: swatch.color,
                          border: '1px solid rgba(255,255,255,0.15)',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </Group>
                </Stack>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </Stack>

      {/* ── Font Picker ── */}
      <Stack gap="sm">
        <Text
          size="xs"
          style={{
            fontFamily: monoFont,
            color: dimText,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          select font
        </Text>

        <Group gap="xs" wrap="wrap">
          {FONT_FAMILY_OPTIONS.map((opt) => {
            const isSelected = selectedFont === opt.value;
            return (
              <UnstyledButton
                key={opt.value}
                onClick={() => handleFontSelect(opt.value)}
                style={{
                  fontFamily: opt.css,
                  fontSize: 13,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: isSelected
                    ? `1px solid ${cyan}`
                    : '1px solid rgba(255,255,255,0.15)',
                  color: isSelected ? cyan : dimText,
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, color 0.15s ease',
                  letterSpacing: '0.02em',
                }}
              >
                {opt.label}
              </UnstyledButton>
            );
          })}
        </Group>
      </Stack>

      {/* ── Apply button ── */}
      <Group justify="flex-start">
        <Button
          onClick={handleApply}
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
          [ Apply ]
        </Button>
      </Group>
    </Stack>
  );
}

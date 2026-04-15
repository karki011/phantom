/**
 * AudioPhase — Phase 3 of the onboarding flow.
 * Lets the user toggle ceremony sounds on/off and pick a sound style.
 * Tapping a style card previews the boot_complete sound for that style.
 *
 * @author Subash Karki
 */
import { useState } from 'react';
import {
  Button,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useCeremonySounds, type SoundStyle } from '../../../hooks/useCeremonySounds';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioResult {
  sounds: boolean;
  soundsStyle: SoundStyle;
}

interface Props {
  onComplete: (result: AudioResult) => void;
}

// ---------------------------------------------------------------------------
// Style card metadata
// ---------------------------------------------------------------------------

interface StyleCard {
  style: SoundStyle;
  name: string;
  description: string;
}

const STYLE_CARDS: StyleCard[] = [
  { style: 'electronic', name: 'Electronic',  description: 'Sine waves + harmonics' },
  { style: 'minimal',    name: 'Minimal',     description: 'Single clean tones' },
  { style: 'warm',       name: 'Warm',        description: 'Triangle + soft harmonics' },
  { style: 'retro',      name: 'Retro',       description: 'Square wave chiptune' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioPhase({ onComplete }: Props) {
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState<SoundStyle>('electronic');

  // Always use enabled:true for preview regardless of the toggle
  const sounds = useCeremonySounds({
    enabled: true,
    volume: 0.5,
    style: selectedStyle,
    events: { boot_complete: true },
  });

  const handleCardClick = (style: SoundStyle) => {
    setSelectedStyle(style);
    sounds.preview('boot_complete');
  };

  const handleSubmit = () => {
    onComplete({ sounds: soundsEnabled, soundsStyle: selectedStyle });
  };

  return (
    <Stack
      gap="xl"
      style={{
        maxWidth: 440,
        fontFamily: 'var(--phantom-font-mono, monospace)',
        color: 'var(--phantom-text-primary, #e2e8f0)',
      }}
    >
      {/* Header */}
      <Stack gap="xs">
        <Text
          style={{
            fontSize: 13,
            color: 'var(--phantom-accent-cyan, #00d4ff)',
            fontFamily: 'inherit',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          // audio subsystem
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: 'var(--phantom-text-secondary, #94a3b8)',
            fontFamily: 'inherit',
          }}
        >
          Configure ceremony sounds. Tap a style to preview.
        </Text>
      </Stack>

      {/* Sounds toggle */}
      <Switch
        checked={soundsEnabled}
        onChange={(e) => setSoundsEnabled(e.currentTarget.checked)}
        label={
          <Text style={{ fontFamily: 'inherit', fontSize: 13 }}>
            Enable ceremony sounds
          </Text>
        }
        color="cyan"
        styles={{
          root: { alignItems: 'center' },
        }}
      />

      {/* Style picker — only visible when sounds are enabled */}
      {soundsEnabled && (
        <SimpleGrid cols={2} spacing="sm">
          {STYLE_CARDS.map(({ style, name, description }) => {
            const isSelected = selectedStyle === style;
            return (
              <UnstyledButton
                key={style}
                onClick={() => handleCardClick(style)}
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--phantom-accent-cyan, #00d4ff)'
                      : 'rgba(255, 255, 255, 0.1)'
                  }`,
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <Stack gap={4}>
                  <Text
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected
                        ? 'var(--phantom-accent-cyan, #00d4ff)'
                        : 'var(--phantom-text-primary, #e2e8f0)',
                    }}
                  >
                    {name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'inherit',
                      fontSize: 11,
                      color: 'var(--phantom-text-secondary, #94a3b8)',
                    }}
                  >
                    {description}
                  </Text>
                </Stack>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      )}

      {/* Confirm button */}
      <Button
        onClick={handleSubmit}
        variant="outline"
        color="cyan"
        style={{
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: '0.05em',
          borderColor: 'var(--phantom-accent-cyan, #00d4ff)',
          color: 'var(--phantom-accent-cyan, #00d4ff)',
          alignSelf: 'flex-start',
        }}
      >
        [ Confirm ]
      </Button>
    </Stack>
  );
}

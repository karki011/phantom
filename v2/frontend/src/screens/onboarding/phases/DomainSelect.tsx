// Author: Subash Karki

import { createSignal, onMount, For } from 'solid-js';
import { ToggleGroup } from '@kobalte/core/toggle-group';
import {
  applyTheme,
  activeTheme,
  applyFontStyle,
  activeFontStyle,
  type ThemeId,
  type FontStyleId,
} from '../../../core/signals/theme';
import { playSound } from '../../../core/audio/engine';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as styles from '../styles/phases.css';

interface DomainSelectProps {
  onComplete: (data: Record<string, string>) => void;
}

const themes: { id: ThemeId; name: string; desc: string; colors: { bg: string; accent: string; text: string } }[] = [
  { id: 'system-core-dark',      name: 'System Core',          desc: 'Futuristic HUD',     colors: { bg: '#060B14', accent: '#56CCFF', text: '#EAF6FF' } },
  { id: 'system-core-light',     name: 'System Core Light',    desc: 'Awakened clarity',   colors: { bg: '#F4FAFF', accent: '#169DDB', text: '#0D1B2A' } },
  { id: 'shadow-monarch-dark',   name: 'Shadow Monarch',       desc: 'Royal darkness',     colors: { bg: '#050309', accent: '#8B5CFF', text: '#F3EEFF' } },
  { id: 'shadow-monarch-light',  name: 'Shadow Monarch Light', desc: 'Mystic refinement',  colors: { bg: '#FAF7FF', accent: '#6F45E8', text: '#1D1430' } },
  { id: 'hunter-rank-dark',      name: 'Hunter Rank',          desc: 'Tactical ops',       colors: { bg: '#0A0E10', accent: '#3DDC97', text: '#EEF7F4' } },
  { id: 'hunter-rank-light',     name: 'Hunter Rank Light',    desc: 'Mission control',    colors: { bg: '#F5FAF8', accent: '#12B76A', text: '#112019' } },
];

const fontStyles: { id: FontStyleId; name: string; sample: string }[] = [
  { id: 'system',  name: 'System',     sample: 'Clean & native' },
  { id: 'mono',    name: 'Monospace',  sample: 'Code-first'     },
  { id: 'gaming',  name: 'Gaming',     sample: 'Bold & sharp'   },
];

export function DomainSelect(props: DomainSelectProps) {
  const [paused, setPaused] = createSignal(false);

  onMount(() => {
    playSound('reveal');
  });

  function handleConfirm() {
    props.onComplete({ theme: activeTheme(), font_style: activeFontStyle() });
  }

  return (
    <PhasePanel title="Choose Your Domain" subtitle="The System adapts to your will. Select your visual identity.">
      <div
        onPointerDown={() => setPaused(true)}
        onKeyDown={() => setPaused(true)}
        class={styles.phaseStack}
      >
        <div>
          <div class={`${styles.label} ${styles.labelMargin}`}>Theme</div>
          <ToggleGroup
            value={activeTheme()}
            onChange={(val) => {
              if (val) {
                applyTheme(val as ThemeId);
                setPaused(true);
              }
            }}
            class={styles.themeGrid}
          >
            <For each={themes}>
              {(t) => (
                <ToggleGroup.Item value={t.id} class={styles.themeCard}>
                  <div class={styles.themePreview} style={{ background: t.colors.bg }}>
                    <div class={styles.themePreviewAccent} style={{ background: t.colors.accent }} />
                    <span class={styles.themePreviewSampleText} style={{ color: t.colors.text }}>Aa</span>
                  </div>
                  <div class={styles.themeCardBody}>
                    <div class={styles.themeName}>{t.name}</div>
                    <div class={styles.themeDesc}>{t.desc}</div>
                  </div>
                </ToggleGroup.Item>
              )}
            </For>
          </ToggleGroup>
        </div>

        <div>
          <div class={`${styles.label} ${styles.labelMargin}`}>Font Style</div>
          <ToggleGroup
            value={activeFontStyle()}
            onChange={(val) => {
              if (val) {
                applyFontStyle(val as FontStyleId);
                setPaused(true);
              }
            }}
            class={styles.fontGrid}
          >
            <For each={fontStyles}>
              {(f) => (
                <ToggleGroup.Item value={f.id} class={styles.fontCard}>
                  <span class={styles.fontName}>{f.name}</span>
                  <span class={styles.fontSample}>{f.sample}</span>
                </ToggleGroup.Item>
              )}
            </For>
          </ToggleGroup>
        </div>

        <div class={styles.actionCenter}>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleConfirm}
          >
            Claim Domain
          </button>
        </div>
      </div>

      <AutoTimer
        timeout={10000}
        onResolve={handleConfirm}
        message="No preference detected. Default domain attuned."
        paused={paused()}
      />
    </PhasePanel>
  );
}

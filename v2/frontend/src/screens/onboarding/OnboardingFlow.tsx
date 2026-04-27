// Author: Subash Karki

import { createSignal, Show, Switch, Match } from 'solid-js';
import { playSound } from '../../core/audio/engine';
import { speakSystem } from './config/voice';
import { phaseOrder } from './config/phases';
import type { PhaseId } from './config/types';
import { setPref } from '../../core/signals/preferences';
import { HexProgress } from '../../shared/HexProgress/HexProgress';
import { BootTerminal } from './phases/BootTerminal';
import { IdentityBind } from './phases/IdentityBind';
import { DomainSelect } from './phases/DomainSelect';
import { DomainLink } from './phases/DomainLink';
import { AbilityAwaken } from './phases/AbilityAwaken';
import { Awakening } from './phases/Awakening';
import * as styles from './styles/flow.css';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow(props: OnboardingFlowProps) {
  const [phase, setPhase] = createSignal<PhaseId>('awakening');
  const [dissolving, setDissolving] = createSignal(false);
  const data: Record<string, string> = {};

  const completedPhases = () => Math.max(0, phaseOrder.indexOf(phase()) - 1);
  const isMiddlePhase = () => phase() !== 'awakening' && phase() !== 'complete';

  function advancePhase() {
    const current = phaseOrder.indexOf(phase());
    if (current < phaseOrder.length - 1) {
      const next = phaseOrder[current + 1];
      setPhase(next);
      setTimeout(() => { try { playSound('reveal'); } catch {} }, 50);
    }
  }

  function handlePhaseComplete(phaseData?: Record<string, string>) {
    if (phaseData) {
      Object.entries(phaseData).forEach(([k, v]) => {
        data[k] = v;
        void setPref(k, v);
      });
    }
    try { playSound('ok'); } catch {}
    advancePhase();
  }

  function handleFinale() {
    setDissolving(true);
    setTimeout(() => props.onComplete(), 800);
  }

  return (
    <div class={styles.overlay} classList={{ [styles.overlayDissolving]: dissolving() }}>
      <div class={styles.scanlines} />

      <Show when={phase() === 'awakening'}>
        <BootTerminal onBootComplete={() => advancePhase()} />
      </Show>

      <Show when={isMiddlePhase()}>
        <div class={styles.phaseContainer}>
          <Switch>
            <Match when={phase() === 'identity-bind'}>
              <IdentityBind onComplete={handlePhaseComplete} />
            </Match>
            <Match when={phase() === 'domain-select'}>
              <DomainSelect onComplete={handlePhaseComplete} />
            </Match>
            <Match when={phase() === 'domain-link'}>
              <DomainLink onComplete={handlePhaseComplete} />
            </Match>
            <Match when={phase() === 'ability-awaken'}>
              <AbilityAwaken onComplete={handlePhaseComplete} />
            </Match>
          </Switch>
        </div>
      </Show>

      <Show when={phase() === 'complete'}>
        <Awakening data={data} onComplete={handleFinale} />
      </Show>

      <Show when={isMiddlePhase()}>
        <div class={styles.progressBar}>
          <HexProgress total={4} current={completedPhases()} />
        </div>
      </Show>
    </div>
  );
}

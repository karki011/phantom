// Author: Subash Karki

import { createSignal, onMount, Show, type JSX } from 'solid-js';
import { playSound } from '../../../core/audio/engine';
import type { PhaseConfig, PhaseContext } from '../config/types';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from './AutoTimer';

interface PhaseRunnerProps {
  config: PhaseConfig;
  onComplete: (data: Record<string, string>) => void;
  children: (ctx: PhaseContext) => JSX.Element;
}

export function PhaseRunner(props: PhaseRunnerProps) {
  const [autoTimerPaused, setAutoTimerPaused] = createSignal(false);
  const [autoResolved, setAutoResolved] = createSignal(false);

  onMount(() => {
    if (props.config.announcement.sound) {
      playSound(props.config.announcement.sound);
    }
  });

  const handleAutoResolve = () => {
    setAutoResolved(true);
    if (props.config.autoResolve) {
      props.onComplete({
        [props.config.autoResolve.defaultKey]: props.config.autoResolve.defaultValue,
      });
    }
  };

  const ctx: PhaseContext = {
    autoTimerPaused: () => autoTimerPaused(),
    pauseAutoTimer: () => setAutoTimerPaused(true),
    get config() { return props.config; },
  };

  return (
    <PhasePanel title={props.config.title} subtitle={props.config.subtitle}>
      <div
        onPointerDown={() => setAutoTimerPaused(true)}
        onKeyDown={() => setAutoTimerPaused(true)}
      >
        {props.children(ctx)}
      </div>

      <Show when={props.config.autoResolve && !autoResolved()}>
        <AutoTimer
          timeout={props.config.autoResolve!.timeout}
          onResolve={handleAutoResolve}
          message={props.config.autoResolve!.message}
          paused={autoTimerPaused()}
        />
      </Show>
    </PhasePanel>
  );
}

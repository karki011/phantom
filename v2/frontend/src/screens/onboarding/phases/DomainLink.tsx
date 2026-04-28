// Author: Subash Karki

import { createSignal, onMount, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { detectProject, addProject } from '../../../core/bindings';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as styles from '../styles/phases.css';
interface ProjectProfile {
  name: string;
  repo_path: string;
  language: string | null;
  framework: string | null;
}

interface DomainLinkProps {
  onComplete: (data: Record<string, string>) => void;
}

export function DomainLink(props: DomainLinkProps) {
  const [path, setPath] = createSignal('');
  const [detected, setDetected] = createSignal<ProjectProfile | null>(null);
  const [detecting, setDetecting] = createSignal(false);
  const [added, setAdded] = createSignal(false);
  const [paused, setPaused] = createSignal(false);

  onMount(() => {
    playSound('scan');
    speakSystem('A workspace is required for full synchronization.');
  });

  function pause() {
    setPaused(true);
  }

  async function handleDetect() {
    pause();
    const p = path().trim();
    if (!p) return;
    setDetecting(true);
    const profile = await detectProject(p);
    setDetected(profile);
    setDetecting(false);
  }

  async function handleAdd() {
    pause();
    const p = path().trim();
    if (!p) return;
    const project = await addProject(p);
    if (project) {
      setAdded(true);
    }
  }

  function handleComplete() {
    props.onComplete({ first_project_path: path().trim() });
  }

  function handleSkip() {
    props.onComplete({});
  }

  return (
    <PhasePanel title="Link Your Domain" subtitle="The System needs a project to bind to.">
      <div class={styles.phaseStack20}>
        <div class={styles.field}>
          <label class={styles.label}>Project Directory</label>
          <div class={styles.inputRow}>
            <TextField class={styles.inputFlex}>
              <TextField.Input
                class={styles.input}
                placeholder="/path/to/your/project"
                value={path()}
                onInput={(e) => {
                  pause();
                  setPath(e.currentTarget.value);
                  setDetected(null);
                  setAdded(false);
                }}
              />
            </TextField>
            <button
              class={buttonRecipe({ variant: 'primary', size: 'md' })}
              onClick={handleDetect}
              disabled={!path().trim() || detecting()}
            >
              {detecting() ? 'Scanning...' : 'Scan Environment'}
            </button>
          </div>
        </div>

        <Show when={detected()}>
          {(profile) => (
            <div class={styles.projectCard}>
              <div class={styles.projectIcon}>
                {(profile().language?.[0] ?? 'P').toUpperCase()}
              </div>
              <div class={styles.projectInfo}>
                <span class={styles.projectName}>{profile().name}</span>
                <span class={styles.projectMeta}>
                  {[profile().language, profile().framework].filter(Boolean).join(' · ') || 'Unknown type'}
                </span>
              </div>
            </div>
          )}
        </Show>

        <Show when={detected() && !added()}>
          <div class={styles.linkActionCenter}>
            <button
              class={buttonRecipe({ variant: 'primary', size: 'lg' })}
              onClick={handleAdd}
            >
              Link Project
            </button>
          </div>
        </Show>

        <Show when={added()}>
          <div class={styles.successText}>
            Project linked successfully
          </div>
        </Show>

        <div class={styles.footerRow}>
          <Show when={!added()}>
            <button
              class={buttonRecipe({ variant: 'ghost', size: 'lg' })}
              onClick={handleSkip}
            >
              Skip for Now
            </button>
          </Show>
          <Show when={added()}>
            <button
              class={buttonRecipe({ variant: 'primary', size: 'lg' })}
              onClick={handleComplete}
            >
              Continue
            </button>
          </Show>
        </div>
      </div>

      <AutoTimer
        timeout={10000}
        onResolve={handleSkip}
        message="No domain linked. Proceeding without binding."
        paused={paused()}
      />
    </PhasePanel>
  );
}

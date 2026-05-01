// Author: Subash Karki
import { createSignal, onMount, For, Show } from 'solid-js';
import { Zap, Search } from 'lucide-solid';
import { composerListSkills, type ComposerSkill } from '@/core/bindings/composer';
import * as styles from './ComposerSkillBrowser.css';

interface SkillBrowserProps {
  cwd: string;
  onInvoke: (skillName: string) => void;
  onClose: () => void;
}

export default function ComposerSkillBrowser(props: SkillBrowserProps) {
  const [skills, setSkills] = createSignal<ComposerSkill[]>([]);
  const [filter, setFilter] = createSignal('');

  onMount(async () => {
    const list = await composerListSkills(props.cwd);
    setSkills(list);
  });

  const filtered = () => {
    const q = filter().toLowerCase();
    if (!q) return skills();
    return skills().filter(s =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  };

  return (
    <div class={styles.panel}>
      <div class={styles.panelHeader}>
        <Zap size={12} />
        <span class={styles.panelTitle}>Skills</span>
        <span class={styles.panelCount}>{skills().length}</span>
        <button class={styles.panelClose} type="button" onClick={props.onClose}>
          ✕
        </button>
      </div>
      <div class={styles.searchRow}>
        <Search size={11} />
        <input
          class={styles.searchInput}
          type="text"
          placeholder="Filter skills..."
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
      </div>
      <div class={styles.panelBody}>
        <Show when={filtered().length === 0}>
          <div class={styles.panelEmpty}>
            {skills().length === 0
              ? 'No skills found in .claude/skills/'
              : 'No matching skills'}
          </div>
        </Show>
        <For each={filtered()}>
          {(skill) => (
            <div class={styles.skillCard}>
              <div class={styles.skillName}>/{skill.name}</div>
              <Show when={skill.description}>
                <div class={styles.skillDesc}>{skill.description}</div>
              </Show>
              <button
                class={styles.skillInvoke}
                type="button"
                onClick={() => props.onInvoke(`/${skill.name}`)}
              >
                Invoke
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

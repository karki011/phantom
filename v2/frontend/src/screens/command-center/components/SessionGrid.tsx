// Author: Subash Karki

import { For, Show, createMemo, type Accessor } from 'solid-js';
import type { Session } from '../../../core/types';
import { isActiveSession } from '../../../utils/format';
import { SessionCard } from './SessionCard';
import * as styles from './SessionGrid.css';

interface SessionGridProps {
  sessions: Accessor<Session[]>;
}

export function SessionGrid(props: SessionGridProps) {
  const sorted = createMemo(() =>
    [...props.sessions()].sort((a, b) => {
      const aActive = isActiveSession(a.status) ? 1 : 0;
      const bActive = isActiveSession(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (b.started_at ?? 0) - (a.started_at ?? 0);
    })
  );

  const activeCount = () =>
    props.sessions().filter((s) => isActiveSession(s.status)).length;

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <span class={styles.title}>Active Sessions</span>
        <span class={styles.count}>{activeCount()}</span>
      </div>
      <Show
        when={props.sessions().length > 0}
        fallback={<div class={styles.empty}>No active sessions</div>}
      >
        <div class={styles.grid}>
          <For each={sorted()}>{(session) => <SessionCard session={session} />}</For>
        </div>
      </Show>
    </div>
  );
}

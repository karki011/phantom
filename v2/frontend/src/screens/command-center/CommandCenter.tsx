// Author: Subash Karki

import { createSignal, createMemo, onMount } from 'solid-js';
import type { ActivityLog } from '../../core/types';
import { getActivityLog } from '../../core/bindings';
import { sessions } from '../../core/signals/sessions';
import { projects } from '../../core/signals/projects';
import { onWailsEvent } from '../../core/events';
import { isActiveSession } from '../../utils/format';
import { ProjectTree } from './components/ProjectTree';
import { SessionGrid } from './components/SessionGrid';
import { ActivityFeed } from './components/ActivityFeed';
import * as styles from './CommandCenter.css';

const MAX_ACTIVITIES = 200;

export function CommandCenter() {
  const [activities, setActivities] = createSignal<ActivityLog[]>([]);
  const [selectedProjectId, setSelectedProjectId] = createSignal<string | null>(null);
  const [selectedWorktree, setSelectedWorktree] = createSignal<string | null>(null);

  const filteredSessions = createMemo(() => {
    const pid = selectedProjectId();
    const wtPath = selectedWorktree();
    let result = sessions();

    if (pid) {
      const proj = projects().find((p) => p.id === pid);
      if (proj) {
        result = result.filter((s) => s.repo === proj.repo_path);
      }
    }

    if (wtPath) {
      result = result.filter((s) => s.cwd === wtPath);
    }

    // Show active sessions + sessions from last 48 hours
    const cutoff = Date.now() / 1000 - 48 * 3600;
    result = result.filter((s) => {
      if (isActiveSession(s.status)) return true;
      return (s.started_at ?? 0) > cutoff;
    });

    // Hide empty sessions (no tokens, no model — scanner artifacts)
    result = result.filter((s) => {
      if (isActiveSession(s.status)) return true;
      const hasData = (s.input_tokens ?? 0) + (s.output_tokens ?? 0) > 0 || s.model;
      return hasData;
    });

    return result;
  });

  const filteredActivities = createMemo(() => {
    const pid = selectedProjectId();
    if (!pid) return activities();

    const sessionIds = new Set(filteredSessions().map((s) => s.id));
    return activities().filter((a) => a.session_id && sessionIds.has(a.session_id));
  });

  onMount(async () => {
    onWailsEvent<ActivityLog>('activity', (entry) => {
      setActivities((prev) => [entry, ...prev].slice(0, MAX_ACTIVITIES));
    });

    const initial = await getActivityLog('', 100);
    setActivities(initial);
  });

  return (
    <div class={styles.layout}>
      <div class={styles.leftPanel}>
        <ProjectTree
          projects={projects}
          sessions={sessions}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          selectedWorktree={selectedWorktree}
          setSelectedWorktree={setSelectedWorktree}
        />
      </div>

      <div class={styles.centerPanel}>
        <SessionGrid sessions={filteredSessions} />
      </div>

      <div class={styles.rightPanel}>
        <ActivityFeed activities={filteredActivities} />
      </div>
    </div>
  );
}

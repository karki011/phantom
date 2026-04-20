// Author: Subash Karki

import { For, Show, createSignal, type Accessor } from 'solid-js';
import type { ActivityLog } from '../../../core/types';
import * as styles from './ActivityFeed.css';

interface ActivityFeedProps {
  activities: Accessor<ActivityLog[]>;
}

function formatRelativeShort(epoch: number): string {
  const ts = epoch > 1e12 ? epoch : epoch * 1000;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return '0s';
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h`;
  return `${Math.floor(diffSecs / 86400)}d`;
}

function eventIcon(type: string): string {
  switch (type) {
    case 'SESSION_START': return '▶';
    case 'SESSION_COMPLETE_BONUS': return '✓';
    case 'TASK_COMPLETE': return '☑';
    case 'SPEED_TASK': return '⚡';
    case 'LONG_SESSION': return '⏱';
    case 'ACHIEVEMENT': return '★';
    case 'FIRST_SESSION_OF_DAY': return '☀';
    case 'NEW_REPO': return '📁';
    default: return '•';
  }
}

function eventLabel(type: string): string {
  switch (type) {
    case 'SESSION_START': return 'Session started';
    case 'SESSION_COMPLETE_BONUS': return 'Session completed';
    case 'TASK_COMPLETE': return 'Task completed';
    case 'SPEED_TASK': return 'Speed task bonus';
    case 'LONG_SESSION': return 'Long session';
    case 'ACHIEVEMENT': return 'Achievement unlocked';
    case 'FIRST_SESSION_OF_DAY': return 'First session today';
    case 'NEW_REPO': return 'New repo detected';
    default: return type.toLowerCase().replace(/_/g, ' ');
  }
}

function typeColorClass(type: string): string {
  switch (type) {
    case 'ACHIEVEMENT':
    case 'SPEED_TASK':
      return styles.typeTool;
    case 'SESSION_START':
    case 'NEW_REPO':
      return styles.typeGit;
    case 'SESSION_COMPLETE_BONUS':
    case 'TASK_COMPLETE':
      return styles.typeResponse;
    default:
      return styles.typeMessage;
  }
}

export function ActivityFeed(props: ActivityFeedProps) {
  const [paused, setPaused] = createSignal(false);
  let listRef: HTMLDivElement | undefined;

  function handleScroll() {
    if (!listRef) return;
    const shouldPause = listRef.scrollTop > 50;
    if (shouldPause !== paused()) setPaused(shouldPause);
  }

  function scrollToTop() {
    listRef?.scrollTo({ top: 0, behavior: 'smooth' });
    setPaused(false);
  }

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <span class={styles.title}>System Feed</span>
        <div class={styles.liveDot} />
      </div>
      <Show when={paused()}>
        <div class={styles.pausedBanner} onClick={scrollToTop}>
          Paused — click to resume
        </div>
      </Show>
      <Show
        when={props.activities().length > 0}
        fallback={<div class={styles.empty}>Waiting for activity...</div>}
      >
        <div class={styles.list} ref={listRef} onScroll={handleScroll}>
          <For each={props.activities()}>
            {(activity) => (
              <div class={styles.entry}>
                <span class={styles.timestamp}>
                  {formatRelativeShort(activity.timestamp)}
                </span>
                <span class={styles.icon}>{eventIcon(activity.type)}</span>
                <span class={`${styles.detail} ${typeColorClass(activity.type)}`}>
                  {eventLabel(activity.type)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

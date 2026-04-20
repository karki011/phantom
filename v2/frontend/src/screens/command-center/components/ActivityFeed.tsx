// Author: Subash Karki

import { For, Show, createSignal, type Accessor } from 'solid-js';
import type { ActivityLog, ActivityMetadata } from '../../../core/types';
import * as styles from './ActivityFeed.css';

interface ActivityFeedProps {
  activities: Accessor<ActivityLog[]>;
}

function parseMetadata(raw: string | null): ActivityMetadata {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ActivityMetadata;
  } catch {
    return {};
  }
}

function formatRelativeShort(epochSecs: number): string {
  const diffSecs = Math.floor(Date.now() / 1000 - epochSecs);
  if (diffSecs < 60) return `${diffSecs}s`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h`;
  return `${Math.floor(diffSecs / 86400)}d`;
}

function typeColorClass(type: string): string {
  switch (type) {
    case 'tool': return styles.typeTool;
    case 'git': return styles.typeGit;
    case 'message': return styles.typeMessage;
    case 'response': return styles.typeResponse;
    default: return styles.typeMessage;
  }
}

export function ActivityFeed(props: ActivityFeedProps) {
  const [paused, setPaused] = createSignal(false);
  let listRef: HTMLDivElement | undefined;

  function handleScroll() {
    if (!listRef) return;
    setPaused(listRef.scrollTop > 50);
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
            {(activity) => {
              const meta = () => parseMetadata(activity.metadata);
              return (
                <div class={styles.entry}>
                  <span class={styles.timestamp}>{formatRelativeShort(activity.timestamp)}</span>
                  <span class={styles.icon}>{meta().icon ?? '•'}</span>
                  <span class={`${styles.detail} ${typeColorClass(activity.type)}`}>
                    {meta().detail ?? activity.type}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

// Author: Subash Karki

import { Show } from 'solid-js';
import { Toast, toaster } from '@kobalte/core/toast';
import { Portal } from 'solid-js/web';
import * as styles from './Toast.css';

export function showToast(title: string, description?: string) {
  toaster.show((props) => (
    <Toast toastId={props.toastId} class={styles.toast}>
      <div class={styles.toastContent}>
        <div>
          <Toast.Title class={styles.toastTitle}>{title}</Toast.Title>
          <Show when={description}>
            <Toast.Description class={styles.toastDescription}>{description}</Toast.Description>
          </Show>
        </div>
        <Toast.CloseButton class={styles.toastClose}>×</Toast.CloseButton>
      </div>
      <Toast.ProgressTrack class={styles.progressTrack}>
        <Toast.ProgressFill class={styles.progressFill} />
      </Toast.ProgressTrack>
    </Toast>
  ));
}

export function showWarningToast(title: string, description?: string) {
  toaster.show((props) => (
    <Toast toastId={props.toastId} class={styles.toast}>
      <div class={styles.toastContent}>
        <div>
          <Toast.Title class={styles.toastTitleWarning}>{title}</Toast.Title>
          <Show when={description}>
            <Toast.Description class={styles.toastDescription}>{description}</Toast.Description>
          </Show>
        </div>
        <Toast.CloseButton class={styles.toastClose}>×</Toast.CloseButton>
      </div>
      <Toast.ProgressTrack class={styles.progressTrack}>
        <Toast.ProgressFill class={styles.progressFillWarning} />
      </Toast.ProgressTrack>
    </Toast>
  ));
}

export function ToastRegion() {
  return (
    <Portal>
      <Toast.Region duration={4000} limit={3} pauseOnInteraction>
        <Toast.List class={styles.toastList} />
      </Toast.Region>
    </Portal>
  );
}

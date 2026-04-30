// Phantom — Reactive ward alert state (global signals)
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { WardEvaluation } from '../types';
import { onWailsEvent } from '../events';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';

const [wardAlerts, setWardAlerts] = createSignal<WardEvaluation[]>([]);
const [pendingApproval, setPendingApproval] = createSignal<WardEvaluation | null>(null);
const [wardAlertCount, setWardAlertCount] = createSignal(0);

export function bootstrapWards(): void {
  onWailsEvent<WardEvaluation>('ward:triggered', (ev) => {
    setWardAlerts((prev) => [ev, ...prev].slice(0, 100));
    setWardAlertCount((c) => c + 1);

    if (ev.level === 'confirm') {
      setPendingApproval(ev);
    }
  });

  onWailsEvent<WardEvaluation>('ward:blocked', (ev) => {
    showWarningToast(`Ward: ${ev.rule_name}`, ev.message);
  });

  onWailsEvent<WardEvaluation>('ward:warned', (ev) => {
    showToast(`Ward: ${ev.rule_name}`, ev.message);
  });
}

export function dismissApproval(): void {
  setPendingApproval(null);
}

export function clearAlerts(): void {
  setWardAlerts([]);
  setWardAlertCount(0);
}

export { wardAlerts, pendingApproval, wardAlertCount };

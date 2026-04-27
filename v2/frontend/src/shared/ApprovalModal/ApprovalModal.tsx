// PhantomOS v2 — Ward confirm-level approval modal
// Author: Subash Karki

import { createMemo } from 'solid-js';
import { PhantomModal } from '@/shared/PhantomModal/PhantomModal';
import { pendingApproval, dismissApproval } from '@/core/signals/wards';
import { resumeSession } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import * as styles from '../WardAlerts/WardAlerts.css';

export function ApprovalModal() {
  const isOpen = createMemo(() => pendingApproval() !== null);

  async function handleApprove() {
    const approval = pendingApproval();
    if (!approval) return;
    try {
      await resumeSession(approval.session_id);
      showToast('Approved', `Rule "${approval.rule_name}" — session resumed`);
    } catch (e) {
      showWarningToast('Error', String(e));
    }
    dismissApproval();
  }

  function handleReject() {
    const approval = pendingApproval();
    if (approval) {
      showToast('Rejected', `Session remains paused — rule "${approval.rule_name}"`);
    }
    dismissApproval();
  }

  return (
    <PhantomModal
      open={isOpen}
      onOpenChange={(v) => { if (!v) dismissApproval(); }}
      title="Ward Approval Required"
      size="sm"
    >
      <div class={styles.approvalStack}>
        <div class={styles.approvalDetail}>
          <div>
            <span class={styles.approvalLabel}>Rule</span>
            <div class={styles.approvalValue}>{pendingApproval()?.rule_name}</div>
          </div>
          <div>
            <span class={styles.approvalLabel}>Message</span>
            <div class={styles.approvalValue}>{pendingApproval()?.message}</div>
          </div>
          <div>
            <span class={styles.approvalLabel}>Tool</span>
            <div class={styles.approvalValue}>{pendingApproval()?.tool_name || 'N/A'}</div>
          </div>
          <div>
            <span class={styles.approvalLabel}>Input</span>
            <div class={styles.approvalValue}>
              {(pendingApproval()?.tool_input ?? '').slice(0, 200)}
              {(pendingApproval()?.tool_input?.length ?? 0) > 200 ? '…' : ''}
            </div>
          </div>
        </div>

        <div class={styles.approvalActions}>
          <button class={styles.approveButton} onClick={handleApprove}>
            Approve &amp; Resume
          </button>
          <button class={styles.rejectButton} onClick={handleReject}>
            Reject (Stay Paused)
          </button>
        </div>
      </div>
    </PhantomModal>
  );
}

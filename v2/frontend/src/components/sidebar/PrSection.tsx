// Phantom — PR Section component for Activity Panel
// Author: Subash Karki

import { Show, type Component } from 'solid-js';
import { GitPullRequest, ExternalLink, Loader2 } from 'lucide-solid';
import type { PrStatus } from '@/core/types';
import {
  ghAvailable,
  isCreatingPr,
  setIsCreatingPr,
  prStatus,
  setPrStatus,
} from '@/core/signals/activity';
import { createPrWithAI } from '@/core/bindings/git';
import { openURL } from '@/core/bindings/shell';
import { activeProviderLabel } from '@/core/signals/active-provider';
import { vars } from '@/styles/theme.css';
import * as s from '@/styles/right-sidebar.css';

interface PrSectionProps {
  worktreeId: string;
  isDefaultBranch: boolean;
}

function stateColor(pr: PrStatus): string {
  if (pr.is_draft) return vars.color.textDisabled;
  switch (pr.state.toUpperCase()) {
    case 'OPEN':   return vars.color.success;
    case 'MERGED': return vars.color.mana;
    case 'CLOSED': return vars.color.danger;
    default:       return vars.color.textDisabled;
  }
}

function stateLabel(pr: PrStatus): string {
  if (pr.is_draft) return 'DRAFT';
  return pr.state.toUpperCase();
}

async function handleCreatePr(worktreeId: string, draft: boolean) {
  setIsCreatingPr(true);
  try {
    const result = await createPrWithAI(worktreeId, draft);
    setPrStatus(result);
  } finally {
    setIsCreatingPr(false);
  }
}

const PrSection: Component<PrSectionProps> = (props) => {
  return (
    <Show when={!props.isDefaultBranch && ghAvailable()}>
      <div class={s.prSection}>
        {/* Section header */}
        <div class={s.prSectionHeader}>
          <GitPullRequest size={11} />
          PULL REQUEST
        </div>

        {/* Creating state */}
        <Show when={isCreatingPr()}>
          <div class={s.prCreatingRow}>
            <Loader2 size={12} class={s.spinning} />
            <span class={s.prCreatingText}>
              {activeProviderLabel()} is creating PR...
            </span>
          </div>
        </Show>

        {/* PR exists */}
        <Show when={!isCreatingPr() && prStatus() !== null}>
          {(_) => {
            const pr = prStatus()!;
            return (
              <div class={s.prCard}>
                {/* State badge row */}
                <div class={s.prStateBadgeRow}>
                  <span
                    class={s.prStateDot}
                    style={{ 'background-color': stateColor(pr) }}
                  />
                  <span class={s.prStateLabel} style={{ color: stateColor(pr) }}>
                    {stateLabel(pr)}
                  </span>
                </div>

                {/* Title + number row */}
                <div
                  class={s.prTitleRow}
                  role="link"
                  tabIndex={0}
                  onClick={() => openURL(pr.url)}
                  onKeyDown={(e) => e.key === 'Enter' && openURL(pr.url)}
                >
                  <span class={s.prTitle}>
                    {pr.title}
                  </span>
                  <span class={s.prNumber}>
                    #{pr.number}
                  </span>
                  <ExternalLink size={10} class={s.prExternalLink} />
                </div>

                {/* Branch info row */}
                <div class={s.prBranchInfo}>
                  {pr.head_ref_name} → {pr.base_ref_name}
                </div>
              </div>
            );
          }}
        </Show>

        {/* No PR, not creating */}
        <Show when={!isCreatingPr() && prStatus() === null}>
          <div class={s.prEmptyText}>
            No pull request
          </div>
          <div class={s.createPrButtonStack}>
            <button
              class={s.createPrButton}
              type="button"
              onClick={() => handleCreatePr(props.worktreeId, false)}
            >
              <GitPullRequest size={12} />
              Create PR with {activeProviderLabel()}
            </button>
            <button
              class={s.createPrButtonDraft}
              type="button"
              onClick={() => handleCreatePr(props.worktreeId, true)}
            >
              <GitPullRequest size={12} />
              Draft PR with {activeProviderLabel()}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default PrSection;

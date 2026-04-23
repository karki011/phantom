// PhantomOS v2 — PR Section component for Activity Panel
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

async function handleCreatePr(worktreeId: string) {
  setIsCreatingPr(true);
  try {
    const result = await createPrWithAI(worktreeId);
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
            <span style={{ color: 'inherit', 'font-size': '0.73rem' }}>
              Claude is creating PR...
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
                <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '4px' }}>
                  <span
                    class={s.prStateDot}
                    style={{ 'background-color': stateColor(pr) }}
                  />
                  <span style={{
                    'font-size': '0.65rem',
                    'font-weight': '700',
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.07em',
                    color: stateColor(pr),
                  }}>
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
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                    'white-space': 'nowrap',
                    'font-size': '0.73rem',
                  }}>
                    {pr.title}
                  </span>
                  <span style={{ 'font-size': '0.68rem', color: 'inherit', opacity: 0.5, 'flex-shrink': '0' }}>
                    #{pr.number}
                  </span>
                  <ExternalLink size={10} style={{ 'flex-shrink': '0', opacity: 0.5 }} />
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
          <div style={{ 'font-size': '0.73rem', color: 'inherit', opacity: 0.4, 'margin-bottom': '6px' }}>
            No pull request
          </div>
          <button
            class={s.createPrButton}
            type="button"
            onClick={() => handleCreatePr(props.worktreeId)}
          >
            <GitPullRequest size={12} />
            Create PR with Claude
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default PrSection;

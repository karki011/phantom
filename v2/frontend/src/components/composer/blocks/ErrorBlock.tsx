// Author: Subash Karki

import { Show, type Component } from 'solid-js';
import { AlertTriangle, RefreshCw } from 'lucide-solid';
import { vars } from '@/styles/theme.css';
import type { ContentBlock } from '@/core/composer/types';

interface ErrorBlockProps {
  block: ContentBlock;
  onRetry?: () => void;
}

const ErrorBlock: Component<ErrorBlockProps> = (props) => {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'flex-start',
        gap: '8px',
        padding: '8px 12px',
        color: vars.color.danger,
        'border-radius': '4px',
        background: vars.color.dangerMuted,
      }}
    >
      <AlertTriangle size={16} style={{ 'flex-shrink': '0', 'margin-top': '2px' }} />
      <span style={{ 'word-break': 'break-word', flex: '1' }}>{props.block.text}</span>
      <Show when={props.onRetry}>
        <button
          type="button"
          onClick={() => props.onRetry?.()}
          aria-label="Retry this prompt"
          style={{
            display: 'inline-flex',
            'align-items': 'center',
            gap: vars.space.xs,
            padding: `3px ${vars.space.md}`,
            'border-radius': vars.radius.sm,
            border: `1px solid ${vars.color.accent}`,
            background: 'transparent',
            color: vars.color.accent,
            'font-size': vars.fontSize.xs,
            'font-weight': '500',
            cursor: 'pointer',
            'flex-shrink': '0',
          }}
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </Show>
    </div>
  );
};

export default ErrorBlock;

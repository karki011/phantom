// Phantom — driver.js theme overrides for the guided tour
// Author: Subash Karki

const TOUR_STYLE_ID = '__phantom-tour-theme';

export function injectTourStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(TOUR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TOUR_STYLE_ID;
  style.textContent = `
    .phantom-tour-popover {
      background: var(--phantom-surface-card, #0D1422) !important;
      border: 1px solid var(--phantom-accent-cyan, #56CCFF) !important;
      border-radius: 12px !important;
      color: var(--phantom-text-primary, #EAF6FF) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', ui-monospace, monospace) !important;
      box-shadow: 0 0 30px rgba(86, 204, 255, 0.18) !important;
      min-width: 380px !important;
      max-width: 520px !important;
    }
    .phantom-tour-popover .driver-popover-navigation-btns {
      flex-wrap: nowrap !important;
      gap: 8px !important;
    }
    .phantom-tour-popover .driver-popover-title {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: var(--phantom-accent-cyan, #56CCFF) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', ui-monospace, monospace) !important;
      letter-spacing: 0.04em !important;
    }
    .phantom-tour-popover .driver-popover-description {
      font-size: 12px !important;
      color: var(--phantom-text-secondary, #9CB2CC) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', ui-monospace, monospace) !important;
      line-height: 1.6 !important;
      white-space: pre-line !important;
      margin-bottom: 16px !important;
    }
    .phantom-tour-popover .driver-popover-footer {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      margin-top: 8px !important;
    }
    .phantom-tour-popover .driver-popover-progress-text {
      font-size: 10px !important;
      color: var(--phantom-text-muted, rgba(234, 246, 255, 0.45)) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', ui-monospace, monospace) !important;
      flex-shrink: 0 !important;
    }
    .phantom-tour-popover .driver-popover-navigation-btns button {
      font-family: var(--phantom-font-mono, 'JetBrains Mono', ui-monospace, monospace) !important;
      font-size: 11px !important;
      letter-spacing: 0.04em !important;
      border-radius: 6px !important;
      padding: 6px 14px !important;
      text-shadow: none !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .phantom-tour-popover .driver-popover-next-btn,
    .phantom-tour-popover .driver-popover-close-btn {
      background: transparent !important;
      border: 1px solid var(--phantom-accent-cyan, #56CCFF) !important;
      color: var(--phantom-accent-cyan, #56CCFF) !important;
    }
    .phantom-tour-popover .driver-popover-next-btn:hover,
    .phantom-tour-popover .driver-popover-close-btn:hover {
      background: rgba(86, 204, 255, 0.1) !important;
    }
    .phantom-tour-popover .driver-popover-prev-btn {
      background: transparent !important;
      border: 1px solid var(--phantom-border-subtle, rgba(234, 246, 255, 0.1)) !important;
      color: var(--phantom-text-muted, rgba(234, 246, 255, 0.45)) !important;
    }
    .phantom-tour-popover .driver-popover-prev-btn:hover {
      background: rgba(234, 246, 255, 0.05) !important;
    }
    .phantom-tour-popover .driver-popover-arrow-side-bottom .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-top .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-left .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-right .driver-popover-arrow {
      border-color: var(--phantom-surface-card, #0D1422) !important;
    }
  `;
  document.head.appendChild(style);
}

// Author: Subash Karki

import { For, Show, createSignal, createEffect, createMemo, type Component } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import type { Message } from '@/core/composer/types';
import MessageBubble from './MessageBubble';
import * as s from './MessageList.css';

interface MessageListProps {
  messages: Message[];
  /** Font size in pixels — applied to the entire message feed (matches V1 behaviour) */
  fontSize?: number;
  /** Whether Claude is currently streaming a response */
  isStreaming?: boolean;
  /** Current tool being used (for streaming status bar) */
  currentTool?: string;
  /** Expose the scroll container ref for search overlay DOM walking */
  onScrollRef?: (el: HTMLDivElement) => void;
  /** Called when user clicks Retry on an error block — resends the last user message */
  onRetry?: () => void;
}

/** §9.6: auto-scroll threshold — if user is within 64px of bottom, snap on new content */
const SCROLL_THRESHOLD = 150;

/** §9.4: only engage virtualizer when list exceeds this count */
const VIRTUALIZE_THRESHOLD = 50;

/** Rough estimate for a message bubble height (px) */
const ESTIMATED_ITEM_SIZE = 80;

const MessageList: Component<MessageListProps> = (props) => {
  let scrollRef!: HTMLDivElement;
  const [showJump, setShowJump] = createSignal(false);

  // Expose scroll container ref to parent for search overlay
  const setScrollRef = (el: HTMLDivElement) => {
    scrollRef = el;
    props.onScrollRef?.(el);
  };

  const shouldVirtualize = createMemo(() => props.messages.length > VIRTUALIZE_THRESHOLD);

  const isAtBottom = (): boolean => {
    if (!scrollRef) return true;
    return scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight < SCROLL_THRESHOLD;
  };

  const scrollToBottom = () => {
    if (!scrollRef) return;
    scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: 'smooth' });
  };

  const handleScroll = () => {
    setShowJump(!isAtBottom());
  };

  // Virtualizer — always created but only used when shouldVirtualize() is true.
  // createVirtualizer is a reactive primitive; count updates automatically.
  const virtualizer = createVirtualizer({
    get count() {
      return props.messages.length;
    },
    getScrollElement: () => scrollRef,
    estimateSize: () => ESTIMATED_ITEM_SIZE,
    overscan: 10,
  });

  // Watch messages.length — scroll to bottom when new messages arrive and user is at bottom
  createEffect(() => {
    const _len = props.messages.length;
    // Also react to the last message's content length for streaming updates
    const lastMsg = props.messages[props.messages.length - 1];
    const _contentLen = lastMsg?.content?.length ?? 0;

    // Always scroll to bottom when a new user message appears (user just sent)
    const secondLast = props.messages[props.messages.length - 2]
    const forceScroll = secondLast?.role === 'user' && lastMsg?.role === 'assistant' && lastMsg?.status === 'streaming'

    if (forceScroll || isAtBottom()) {
      if (shouldVirtualize()) {
        // For virtualized mode, scroll via the virtualizer then fallback to raw scroll
        virtualizer.scrollToIndex(props.messages.length - 1, { align: 'end' });
        queueMicrotask(() => {
          if (scrollRef) {
            scrollRef.scrollTop = scrollRef.scrollHeight;
          }
        });
      } else {
        // Use queueMicrotask so DOM has rendered the new content
        queueMicrotask(() => {
          if (scrollRef) {
            scrollRef.scrollTop = scrollRef.scrollHeight;
          }
        });
      }
    } else {
      setShowJump(true);
    }
  });

  return (
    <div class={s.container}>
      <div class={s.scrollArea} ref={setScrollRef} onScroll={handleScroll} style={{ 'font-size': props.fontSize ? `${props.fontSize}px` : undefined }}>
        <Show
          when={shouldVirtualize()}
          fallback={
            <div class={s.messageStack}>
              <For each={props.messages}>
                {(message, idx) => (
                  <MessageBubble
                    message={message}
                    prevRole={idx() > 0 ? props.messages[idx() - 1].role : undefined}
                    onRetry={
                      idx() === props.messages.length - 1 &&
                      message.content.some((b) => b.type === 'error')
                        ? props.onRetry
                        : undefined
                    }
                  />
                )}
              </For>
            </div>
          }
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualItem) => {
                const message = () => props.messages[virtualItem.index];
                return (
                  <div
                    data-index={virtualItem.index}
                    ref={(el) => {
                      queueMicrotask(() => virtualizer.measureElement(el));
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div class={s.virtualItem}>
                      <Show when={message()}>
                        {(msg) => (
                          <MessageBubble
                            message={msg()}
                            prevRole={virtualItem.index > 0 ? props.messages[virtualItem.index - 1]?.role : undefined}
                            onRetry={
                              virtualItem.index === props.messages.length - 1 &&
                              msg().content.some((b) => b.type === 'error')
                                ? props.onRetry
                                : undefined
                            }
                          />
                        )}
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
        <Show when={props.isStreaming}>
          <div class={s.streamingBar}>
            <span class={s.streamingDot} />
            <span>{props.currentTool ? `Running: ${props.currentTool}` : 'Claude is thinking...'}</span>
          </div>
        </Show>
      </div>
      <Show when={showJump() && !props.isStreaming}>
        <div class={s.jumpPill} onClick={scrollToBottom}>
          Jump to latest
        </div>
      </Show>
    </div>
  );
};

export default MessageList;

/**
 * EventBus Tests
 * @author Subash Karki
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/event-bus.js';
import type { GraphEvent } from '../types/events.js';

describe('EventBus', () => {
  it('emits events to type-specific listeners', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('graph:build:start', listener);
    bus.emit({
      type: 'graph:build:start',
      projectId: 'test',
      phase: 'layer1',
      totalFiles: 100,
      timestamp: Date.now(),
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].type).toBe('graph:build:start');
  });

  it('does not call listeners for other event types', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('graph:build:start', listener);
    bus.emit({
      type: 'graph:build:complete',
      projectId: 'test',
      phase: 'layer1',
      stats: { files: 10, edges: 20, durationMs: 100 },
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('onAll receives all event types', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.onAll(listener);

    bus.emit({
      type: 'graph:build:start',
      projectId: 'test',
      phase: 'layer1',
      totalFiles: 100,
      timestamp: Date.now(),
    });
    bus.emit({
      type: 'graph:build:complete',
      projectId: 'test',
      phase: 'layer1',
      stats: { files: 10, edges: 20, durationMs: 100 },
      timestamp: Date.now(),
    });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns unsubscribe function from on()', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const unsub = bus.on('graph:build:start', listener);
    unsub();

    bus.emit({
      type: 'graph:build:start',
      projectId: 'test',
      phase: 'layer1',
      totalFiles: 100,
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function from onAll()', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const unsub = bus.onAll(listener);
    unsub();

    bus.emit({
      type: 'graph:stale',
      projectId: 'test',
      staleFiles: 5,
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('removeAll clears all listeners', () => {
    const bus = new EventBus();
    const typeListener = vi.fn();
    const allListener = vi.fn();

    bus.on('graph:build:start', typeListener);
    bus.onAll(allListener);
    bus.removeAll();

    bus.emit({
      type: 'graph:build:start',
      projectId: 'test',
      phase: 'layer1',
      totalFiles: 100,
      timestamp: Date.now(),
    });

    expect(typeListener).not.toHaveBeenCalled();
    expect(allListener).not.toHaveBeenCalled();
  });

  it('handles multiple listeners per event type', () => {
    const bus = new EventBus();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.on('graph:build:start', listener1);
    bus.on('graph:build:start', listener2);

    bus.emit({
      type: 'graph:build:start',
      projectId: 'test',
      phase: 'layer1',
      totalFiles: 100,
      timestamp: Date.now(),
    });

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });
});

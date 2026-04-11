/**
 * EventBus — Typed event emitter for graph lifecycle events
 * Used to power the GraphStatus UI indicator
 *
 * @author Subash Karki
 */
import type { GraphEvent, GraphEventListener, GraphEventType } from '../types/events.js';

export class EventBus {
  private listeners = new Map<GraphEventType, Set<GraphEventListener>>();
  private allListeners = new Set<GraphEventListener>();

  on(type: GraphEventType, listener: GraphEventListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  /** Listen to all event types */
  onAll(listener: GraphEventListener): () => void {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  emit(event: GraphEvent): void {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const listener of set) listener(event);
    }
    for (const listener of this.allListeners) listener(event);
  }

  removeAll(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}

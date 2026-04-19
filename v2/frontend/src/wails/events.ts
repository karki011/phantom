import { createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';

export function useWailsEvent<T>(eventName: string): Accessor<T | null> {
  const [data, setData] = createSignal<T | null>(null);

  if (window.runtime?.EventsOn) {
    const unsub = window.runtime.EventsOn(eventName, (payload: T) => {
      setData(() => payload);
    });
    onCleanup(() => unsub?.());
  }

  return data;
}

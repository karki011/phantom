import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { Dialog } from '@kobalte/core/dialog';
import { shadowMonarchTheme, vars } from './styles/theme.css';
import * as styles from './styles/app.css';

declare global {
  interface Window {
    go: {
      'internal/app': {
        App: {
          HealthCheck(): Promise<{
            status: string;
            version: string;
            uptime_ms: number;
            ws_port: number;
            go_version: string;
            goroutines: number;
            mem_alloc_mb: number;
          }>;
        };
      };
    };
    runtime: {
      EventsOn(event: string, callback: (...args: any[]) => void): () => void;
    };
  }
}

interface HealthData {
  status: string;
  version: string;
  uptime_ms: number;
  ws_port: number;
  go_version: string;
  goroutines: number;
  mem_alloc_mb: number;
}

export function App() {
  const [health, setHealth] = createSignal<HealthData | null>(null);
  const [pulse, setPulse] = createSignal<HealthData | null>(null);
  const [aboutOpen, setAboutOpen] = createSignal(false);

  onMount(async () => {
    try {
      const result = await window.go['internal/app'].App.HealthCheck();
      setHealth(result);
    } catch {
      // Wails bindings not available in dev server mode
    }

    // Subscribe to health pulse events
    if (window.runtime?.EventsOn) {
      const unsub = window.runtime.EventsOn('health:pulse', (data: HealthData) => {
        setPulse(data);
      });
      onCleanup(() => unsub?.());
    }
  });

  const currentHealth = () => pulse() || health();
  const isConnected = () => currentHealth()?.status === 'ok';

  onMount(() => {
    document.body.classList.add(shadowMonarchTheme);
  });

  return (
    <div class={styles.appContainer}>
      <h1 class={styles.title} onClick={() => setAboutOpen(true)}>
        Phantom OS
      </h1>
      <p class={styles.subtitle}>System Online</p>

      <Dialog open={aboutOpen()} onOpenChange={setAboutOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: 'fixed',
              inset: 0,
              background: vars.color.bgOverlay,
              'z-index': 50,
            }}
          />
          <Dialog.Content
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: vars.color.bgTertiary,
              border: `1px solid ${vars.color.accent}`,
              'border-radius': vars.radius.lg,
              padding: vars.space.xl,
              'min-width': '360px',
              'z-index': 51,
              'box-shadow': vars.shadow.glow,
            }}
          >
            <Dialog.Title
              style={{
                'font-family': vars.font.display,
                'font-size': vars.fontSize.lg,
                color: vars.color.accent,
                'letter-spacing': '0.1em',
                'margin-bottom': vars.space.lg,
              }}
            >
              PHANTOM OS
            </Dialog.Title>
            <Dialog.Description>
              <Show when={currentHealth()} fallback={<p style={{ color: vars.color.textSecondary }}>Loading...</p>}>
                {(h) => (
                  <div
                    style={{
                      'font-family': vars.font.mono,
                      'font-size': vars.fontSize.sm,
                      color: vars.color.textPrimary,
                      display: 'flex',
                      'flex-direction': 'column',
                      gap: vars.space.sm,
                    }}
                  >
                    <p>Version: <span style={{ color: vars.color.textPrimary }}>{h().version}</span></p>
                    <p>Status: <span style={{ color: vars.color.success }}>{h().status}</span></p>
                    <p>Go: <span style={{ color: vars.color.textPrimary }}>{h().go_version}</span></p>
                    <p>Goroutines: <span style={{ color: vars.color.info }}>{h().goroutines}</span></p>
                    <p>Memory: <span style={{ color: vars.color.info }}>{h().mem_alloc_mb.toFixed(1)} MB</span></p>
                    <p>Uptime: <span style={{ color: vars.color.textPrimary }}>{Math.floor(h().uptime_ms / 1000)}s</span></p>
                    <p style={{ 'margin-top': vars.space.md, 'font-size': vars.fontSize.xs, color: vars.color.textDisabled }}>
                      Author: Subash Karki
                    </p>
                  </div>
                )}
              </Show>
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>

      <div class={styles.statusBar}>
        <div class={styles.healthInfo}>
          <span
            class={`${styles.statusDot} ${isConnected() ? styles.statusDotOnline : styles.statusDotOffline}`}
          />
          <span>{isConnected() ? 'Connected' : 'Connecting...'}</span>
        </div>
        <Show when={currentHealth()}>
          {(h) => (
            <>
              <span>v{h().version}</span>
              <span>Goroutines: {h().goroutines}</span>
              <span>Mem: {h().mem_alloc_mb.toFixed(1)}MB</span>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

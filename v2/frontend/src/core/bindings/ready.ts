// Phantom — Wails runtime readiness gate
// Author: Subash Karki

let resolved = false;
let readyPromise: Promise<void> | null = null;

export function waitForWails(): Promise<void> {
  if (resolved) return Promise.resolve();

  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      if ((window as any).go?.app?.App) {
        resolved = true;
        resolve();
        return;
      }

      const check = setInterval(() => {
        if ((window as any).go?.app?.App) {
          clearInterval(check);
          resolved = true;
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(check);
        resolved = true;
        resolve();
      }, 5000);
    });
  }

  return readyPromise;
}

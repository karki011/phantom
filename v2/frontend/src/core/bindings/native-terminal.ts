// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export async function nativeTerminalIsEnabled(): Promise<boolean> {
  try {
    return Boolean(await App()?.NativeTerminalIsEnabled());
  } catch {
    return false;
  }
}

export async function setNativeTerminalEnabled(on: boolean): Promise<void> {
  try {
    await App()?.SetNativeTerminalEnabled(on);
  } catch (error) {
    console.error('[native-terminal] setEnabled failed', error);
  }
}

export async function nativeTerminalCreate(
  paneId: string,
  worktreeId: string,
  cwd: string,
): Promise<string | null> {
  try {
    const id = await App()?.NativeTerminalCreate(paneId, worktreeId, cwd);
    return typeof id === 'string' ? id : null;
  } catch (error) {
    console.error('[native-terminal] create failed', { paneId, error });
    return null;
  }
}

export async function nativeTerminalSetPlacement(
  paneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  try {
    await App()?.NativeTerminalSetPlacement(paneId, x, y, width, height);
  } catch (error) {
    console.error('[native-terminal] setPlacement failed', { paneId, error });
  }
}

export async function nativeTerminalDestroy(paneId: string): Promise<void> {
  try {
    await App()?.NativeTerminalDestroy(paneId);
  } catch (error) {
    console.error('[native-terminal] destroy failed', { paneId, error });
  }
}

export async function nativeTerminalFocus(paneId: string): Promise<void> {
  try {
    await App()?.NativeTerminalFocus(paneId);
  } catch (error) {
    console.error('[native-terminal] focus failed', { paneId, error });
  }
}

export async function nativeTerminalSetOcclusion(
  paneId: string,
  hidden: boolean,
): Promise<void> {
  try {
    await App()?.NativeTerminalSetOcclusion(paneId, hidden);
  } catch (error) {
    console.error('[native-terminal] setOcclusion failed', { paneId, error });
  }
}

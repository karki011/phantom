/**
 * PhantomOS Desktop — Window Management
 * Creates and configures the main BrowserWindow.
 * @author Subash Karki
 */
import { app, BrowserWindow, nativeImage, shell } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { allowQuit } from './lifecycle.js';

let mainWindow: BrowserWindow | null = null;

/** Returns the current main window (or null if closed). */
export const getMainWindow = (): BrowserWindow | null => mainWindow;

/** Creates and shows the main application window. */
export const createWindow = (): void => {
  // Load app icon from resources
  const iconPath = join(__dirname, '../../resources/icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);

  // Set dock icon on macOS
  if (process.platform === 'darwin' && !appIcon.isEmpty()) {
    app.dock?.setIcon(appIcon);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: appIcon,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 16 },
    backgroundColor: '#0d0d10',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Show window when ready — launch in macOS fullscreen
  mainWindow.on('ready-to-show', () => {
    mainWindow?.setFullScreen(true);
    mainWindow?.show();
  });

  // Intercept window close — show shutdown ceremony instead of instant close
  mainWindow.on('close', (event) => {
    if (!allowQuit()) {
      event.preventDefault();
      mainWindow?.webContents.send('phantom:initiate-shutdown');
    }
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev: load from Vite dev server. Prod: load built files.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/**
 * PhantomOS Desktop — Preload Script
 * Exposes safe APIs to the renderer via contextBridge.
 * @author Subash Karki
 */
import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

import { phantomAPI } from './api';

// Expose Electron APIs to renderer
contextBridge.exposeInMainWorld('electron', electronAPI);

// Expose PhantomOS-specific APIs
contextBridge.exposeInMainWorld('phantomOS', phantomAPI);

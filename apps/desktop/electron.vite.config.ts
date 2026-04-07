/**
 * PhantomOS Desktop — electron-vite Configuration
 * Configures main, preload, and renderer builds.
 * @author Subash Karki
 */
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    server: {
      port: 3850,
      proxy: {
        '/api': 'http://localhost:3849',
        '/events': 'http://localhost:3849',
        '/health': 'http://localhost:3849',
        '/ws': {
          target: 'ws://localhost:3849',
          ws: true,
        },
      },
    },
    resolve: {
      // Follow symlinks so Vite resolves the shared web app source
      preserveSymlinks: false,
    },
  },
});

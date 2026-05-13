// Author: Subash Karki

import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { resolve } from 'path';

export default defineConfig({
  plugins: [solidPlugin(), vanillaExtractPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    // esbuild is the default — kept explicit for clarity. Switch to 'terser'
    // only if we add terser as a devDep; esbuild compresses well enough here.
    minify: 'esbuild',
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Monaco editor — large (~4MB), isolate into its own chunk so it
          // loads lazily only when an editor pane is opened.
          if (id.includes('node_modules/monaco-editor')) {
            return 'monaco';
          }
          // xterm.js + addons — pulled in only when a terminal pane mounts.
          if (id.includes('node_modules/@xterm/')) {
            return 'terminal';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createExportHandlers } from './scripts/exportBridge.mjs';

// The Remotion render entry (src/render) is intentionally NOT imported from
// index.html, so it stays out of Vite's build graph. tsc still typechecks it.
//
// Export API: server-side Remotion render bridge (runs OUTSIDE the browser,
// per PRD §68). Wired as dev/preview middleware so the editor can stream an
// SSE progress feed and serve finished artifacts.
function registerExportApi(server) {
  const handlers = createExportHandlers();
  server.middlewares.use((req, res, next) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/api/export' || path === '/api/export/') {
      return handlers.exportHandler(req, res, next);
    }
    if (path === '/api/export/cancel') {
      return handlers.cancelHandler(req, res, next);
    }
    if (path.startsWith('/api/export/file')) {
      return handlers.fileHandler(req, res, next);
    }
    return next();
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'strategy-lab-export-api',
      configureServer(server) {
        registerExportApi(server);
      },
      configurePreviewServer(server) {
        registerExportApi(server);
      },
    },
  ],
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      external: ['canvas'],
    },
  },
});

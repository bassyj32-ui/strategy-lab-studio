import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Remotion render entry (src/render) is intentionally NOT imported from
// index.html, so it stays out of Vite's build graph. tsc still typechecks it.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      external: ['canvas'],
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to node so pre-existing logic/render tests are unaffected.
    // DOM (React Testing Library) tests opt in with `@vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the static build also works from a sub-path (e.g. GitHub Pages).
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom' },
});

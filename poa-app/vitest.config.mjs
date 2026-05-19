import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal vitest config — covers the pure-function lib (`src/lib/**`).
// React-coupled code is still covered only by the E2E harness.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    environment: 'node',
  },
});

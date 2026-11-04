import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 transforms TSX with Oxc. Automatic runtime means no `import React` in components.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.ts'],
    // Screen tests opt in to jsdom with `// @vitest-environment jsdom`. The setup file
    // does nothing in Node.
    setupFiles: ['apps/web/src/test-setup.ts'],
  },
});

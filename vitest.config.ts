import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the `@/*` alias from tsconfig.json so tests import the same way src does.
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20_000,
  },
});

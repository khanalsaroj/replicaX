import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  dts: false,
  splitting: false,
  shims: true,
  // Preserve the shebang in src/index.ts and mark the output executable.
  banner: {},
});

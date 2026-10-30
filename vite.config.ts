import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5190 },
  preview: { port: 5190 },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});

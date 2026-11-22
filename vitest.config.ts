import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/e2e/**'],
    // The document exporter imports this stylesheet as text. Vitest stubs CSS to "" by default.
    css: { include: [/[/\\]katex[/\\]dist[/\\]katex\.min\.css(?:\?|$)/] },
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});

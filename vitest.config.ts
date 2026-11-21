import { defineConfig } from 'vitest/config';
// `npm test` = unit + worker-lokal. Uji full-stack browser (tests/e2e/*.e2e.test.ts) dijalankan oleh `npm run test:e2e`.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], exclude: ['node_modules/**', 'tests/e2e/**'], testTimeout: 120_000, hookTimeout: 180_000 } });

// Pengukuran stres paginasi (ST-QA-25): node tests/e2e/stress-pages.mjs <sections> → evidence/stress-<sections>.json
import { writeFileSync } from 'node:fs';
import { launch, page, openStudio, waitReady, state, setSource } from './lib.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { candidateSha256 } from '../../scripts/fingerprint.mjs';
const n = Number(process.argv[2] || 115);
const env = await launch({ dir: 'dist-qa', port: 4330 });
try {
  const p = await page(env, { lang: 'id' });
  await openStudio(p, env.base);
  const src = generateStress(n);
  const t0 = Date.now(); await setSource(p, src); await waitReady(p, 300000); const preview = Date.now() - t0;
  const t1 = Date.now();
  await p.click('#t-checks'); await p.click('#p-checks .layout-btn');
  await p.waitForFunction(() => ['done', 'failed'].includes(window.__pf.state().layout.status), { timeout: 900000, polling: 250 });
  const layoutWall = Date.now() - t1;
  const s = await state(p);
  const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const out = { tool: 'tests/e2e/stress-pages.mjs', candidateSha256: candidateSha256(), browser: await env.browser.version(), sections: n, bytes: Buffer.byteLength(src), previewMs: preview, layoutWallMs: layoutWall, layout: s.layout, usedJsHeapMiB: heap, errors: p.log.errors, env: 'Chrome headless, kontainer Linux (bukan perangkat referensi)' };
  writeFileSync(`evidence/stress-${n}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ pages: s.layout.pages, status: s.layout.status, verification: s.layout.verification?.status, previewMs: preview, layoutWallMs: layoutWall, heap }));
} finally { await env.close(); }

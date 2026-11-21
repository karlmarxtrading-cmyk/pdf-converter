import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentMathPass, performanceRunPass, crossBrowserGate } from '../../scripts/result-gates.mjs';

test('deployment rejects old/missing versions and page errors even when all formulas render', () => {
  const expected = { version: '3.0.0-rc.4', tex: ['x'], display: [false] };
  const good = { version: expected.version, katex: 1, errors: 0, raw: [], tex: ['x'], display: [false], currency: true, code: true, pageErrors: [] };
  assert.equal(deploymentMathPass(good, expected), true);
  for (const change of [{ version: null }, { version: '3.0.0-rc.3' }, { pageErrors: ['Uncaught error'] }, { raw: ['\\('] }, { tex: ['y'] }, { currency: false }]) {
    assert.equal(deploymentMathPass({ ...good, ...change }, expected), false, JSON.stringify(change));
  }
});

test('performance runner fails after pagination, PDF, or console errors', () => {
  const good = { layoutStatus: 'done', verification: 'pass', pages: 12, pdfBytes: 1024, errors: [], blocking: [] };
  assert.equal(performanceRunPass(good), true);
  for (const change of [{ error: 'PDF generation failed' }, { verification: 'fail' }, { layoutStatus: 'failed' }, { pdfBytes: 0 }, { pages: 0 }, { errors: ['runtime failure'] }, { blocking: ['PAGE_CONTENT_CHANGED'] }]) {
    assert.equal(performanceRunPass({ ...good, ...change }), false, JSON.stringify(change));
  }
});

test('cross-browser success requires every supported engine and matching document digests', () => {
  const good = ['chromium', 'firefox', 'webkit'].map((engine) => ({ engine, status: 'pass', steps: { digest: { sha256: 'same' } } }));
  assert.equal(crossBrowserGate(good).pass, true);
  assert.equal(crossBrowserGate(good.slice(0, 1)).pass, false);
  assert.equal(crossBrowserGate(good.slice(0, 1)).exitCode, 2);
  assert.equal(crossBrowserGate([]).renderedHtmlIdenticalAcrossEngines, null);
  assert.equal(crossBrowserGate([...good.slice(0, 2), { engine: 'webkit', status: 'not-available' }]).pass, false);
  assert.equal(crossBrowserGate([...good.slice(0, 2), { engine: 'webkit', status: 'fail' }]).exitCode, 1);
  assert.equal(crossBrowserGate([...good.slice(0, 2), { engine: 'webkit', status: 'pass', steps: { digest: { sha256: 'changed' } } }]).pass, false);
  assert.equal(crossBrowserGate([good[0], good[0], good[1], { engine: 'webkit', status: 'skipped' }]).pass, false);
});

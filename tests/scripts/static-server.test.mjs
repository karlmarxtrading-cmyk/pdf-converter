import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../scripts/serve-dist.mjs';

test('local Pages simulator rejects malformed paths and sibling-directory traversal, then remains usable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'paperforma-http-'));
  await mkdir(join(dir, 'dist'));
  await mkdir(join(dir, 'dist-secret'));
  await writeFile(join(dir, 'dist/index.html'), '<h1>Healthy</h1>');
  await writeFile(join(dir, 'dist/404.html'), '<h1>Not found</h1>');
  await writeFile(join(dir, 'dist-secret/private.txt'), 'outside-public-root');
  const server = await startServer(join(dir, 'dist'), 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/%E0%A4%A', '/%00', '/..%2fdist-secret/private.txt', '/%5c..%5cdist-secret/private.txt']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 400, path);
      assert.doesNotMatch(await response.text(), /outside-public-root/);
    }
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/missing')).status, 404);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('deployment preflight rejects stale sources, alternate output bytes and QA builds of the same version', async () => {
  const { deploymentIdentity } = await import('../../scripts/deployment-identity.mjs');
  const { candidateSha256, treeHash } = await import('../../scripts/fingerprint.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'paperforma-identity-'));
  const dist = join(dir, 'dist');
  const pkg = { name: 'paperforma', version: 'candidate-test' };
  try {
    await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<h1>release</h1>');
    const manifest = { app: pkg.name, profile: 'production', version: pkg.version,
      candidateSha256: candidateSha256(), distTreeSha256: treeHash(['dist'], dir).sha256 };
    await writeFile(dist + '.build-manifest.json', JSON.stringify(manifest));
    assert.equal(deploymentIdentity(dist, pkg).candidateSha256, manifest.candidateSha256);
    for (const change of [{ candidateSha256: 'older-source' }, { profile: 'qa' }, { version: 'older-version' }]) {
      await writeFile(dist + '.build-manifest.json', JSON.stringify({ ...manifest, ...change }));
      assert.throws(() => deploymentIdentity(dist, pkg), /Manifest produksi/);
    }
    await writeFile(dist + '.build-manifest.json', JSON.stringify(manifest));
    await writeFile(join(dist, 'index.html'), '<h1>different</h1>');
    assert.throws(() => deploymentIdentity(dist, pkg), /Manifest produksi/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('release identity invalidates changed toolchain pins and Git checkout settings', async () => {
  const { candidateSha256 } = await import('../../scripts/fingerprint.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'paperforma-toolchain-id-'));
  try {
    await mkdir(join(dir, 'scripts', 'toolchain'), { recursive: true });
    const lock = join(dir, 'scripts', 'toolchain', 'linux-64.lock.json');
    await writeFile(lock, '{"pin":"one"}');
    const first = candidateSha256(dir);
    await writeFile(lock, '{"pin":"two"}');
    const second = candidateSha256(dir);
    assert.notEqual(first, second);
    await writeFile(join(dir, '.gitignore'), 'dist');
    assert.notEqual(second, candidateSha256(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Pages requires promotion checks on main and rejects a mismatched production setting', async () => {
  const { requiresPromotionEvidence } = await import('../../scripts/pages-build.mjs');
  assert.equal(requiresPromotionEvidence({}), false);
  assert.equal(requiresPromotionEvidence({ CF_PAGES: '1', CF_PAGES_BRANCH: 'rc11-preview', PAPERFORMA_PRODUCTION_BRANCH: 'main' }), false);
  assert.equal(requiresPromotionEvidence({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PAPERFORMA_PRODUCTION_BRANCH: 'main' }), true);
  assert.throws(() => requiresPromotionEvidence({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PAPERFORMA_PRODUCTION_BRANCH: 'different' }), /must match/);
  assert.throws(() => requiresPromotionEvidence({ CF_PAGES: '1' }), /identify the Git branch/);
});

test('a named preview rehearsal executes the full production verifier without changing the production branch', async () => {
  const { pagesQualification } = await import('../../scripts/pages-build.mjs');
  // Unit inputs only. These are not runtime hosting evidence.
  const sample = { CF_PAGES:'1', CF_PAGES_BRANCH:'preview-12', PAPERFORMA_PRODUCTION_BRANCH:'main', PAPERFORMA_REHEARSAL_BRANCH:'qualify-12' };
  assert.equal(pagesQualification({}), 'local');
  assert.equal(pagesQualification(sample), 'preview');
  assert.equal(pagesQualification({...sample,CF_PAGES_BRANCH:'qualify-12'}), 'preview-rehearsal');
  assert.equal(pagesQualification({...sample,CF_PAGES_BRANCH:'main'}), 'production');
});

test('external collector rejects unrelated source, provider URL, deployment ID and public notes without an observation', async () => {
  const { verifyHostingSession, assertSession } = await import('../../scripts/external-acceptance.mjs');
  const url='https://synthetic.paperforma-example.pages.dev', sourceCommit='a'.repeat(40), deploymentCommit='b'.repeat(40);
  const data={gate:'G15',runId:'unit-only',candidateSha256:'c'.repeat(64),distTreeSha256:'d'.repeat(64),url,branch:'preview-12',sourceCommit,
    evidenceCommit:deploymentCommit,deploymentCommit,deploymentId:'synthetic-test-id'};
  const record={mode:'preview',commit:deploymentCommit,branch:data.branch,url,candidateSha256:data.candidateSha256,distTreeSha256:data.distTreeSha256};
  const provider={id:data.deploymentId,url,project_name:'paperforma-example',environment:'preview',deployment_trigger:{metadata:{commit_hash:deploymentCommit,branch:data.branch}}};
  const log='PAPERFORMA_PAGES_BUILD '+JSON.stringify(record);
  assert.doesNotThrow(()=>verifyHostingSession(data,log,provider));
  assert.throws(()=>verifyHostingSession({...data,url:'https://other.paperforma-example.pages.dev'},log,provider));
  assert.throws(()=>verifyHostingSession(data,log,{...provider,id:'wrong'}));
  assert.throws(()=>verifyHostingSession(data,log,{...provider,environment:'production'}));
  assert.throws(()=>verifyHostingSession(data,'PAPERFORMA_PAGES_BUILD '+JSON.stringify({...record,candidateSha256:'stale'}),provider));
  const start={at:new Date(Date.now()-60000).toISOString(),identity:data,runId:data.runId};
  assert.throws(()=>assertSession({...data,operator:'test',platform:'linux',browser:'test',observedAt:new Date().toISOString(),notes:{}},start),/observed result/);
  assert.throws(()=>assertSession({...data,runId:'other'},start),/Wrong runId/);
});

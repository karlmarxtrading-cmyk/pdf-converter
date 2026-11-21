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

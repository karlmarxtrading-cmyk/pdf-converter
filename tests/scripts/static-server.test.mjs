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

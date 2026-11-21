// Read-only HTTP verifier for the exact local dist. No browser required.
// Usage: node scripts/verify-http.mjs https://project.pages.dev [dist]
// This verifies transport, identity and bytes, NOT rendering or PDF output.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { root } from './fingerprint.mjs';
import { deploymentIdentity } from './deployment-identity.mjs';
import { startServer } from './serve-dist.mjs';

const dir = resolve(root, process.argv[3] || 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const identity = deploymentIdentity(dir, pkg);
const localServer = process.argv[2] === '--local' ? await startServer(dir, 0) : null;
const target = localServer ? `http://127.0.0.1:${localServer.address().port}/` : process.argv[2] || 'http://127.0.0.1:4173/';
const base = new URL(target);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw Error('Gunakan URL http(s) tanpa kredensial, query, atau fragmen.');
}
base.pathname = base.pathname.replace(/\/?$/, '/');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const paths = [];
function walk(at = '') {
  for (const e of readdirSync(join(dir, at), { withFileTypes: true })) {
    const p = at ? `${at}/${e.name}` : e.name;
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && !['_headers', '_redirects'].includes(p)) paths.push(p);
  }
}
walk(); paths.sort();
const jobs = [
  { path: '', file: 'index.html' },
  { path: 'print', file: 'print.html' },
  ...paths.map((path) => ({ path, file: path })),
  { path: '__paperforma_audit_missing__', status: 404 },
  { path: 'api/pdf', status: 404 },
  { path: '_headers', status: 404 },
];
const mime = { '.html': /text\/html/i, '.js': /(?:text|application)\/javascript/i,
  '.css': /text\/css/i, '.woff2': /font\/woff2|application\/font-woff2/i,
  '.svg': /image\/svg\+xml/i, '.png': /image\/png/i, '.json': /application\/json/i,
  '.txt': /text\/plain/i, '.ico': /image\/(?:x-icon|vnd\.microsoft\.icon)/i };
async function readBounded(response, maxBytes) {
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw Error('Respons melampaui ukuran yang diharapkan.'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally { reader.releaseLock(); }
}
const results = Array.from({ length: jobs.length }); let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++; const j = jobs[index]; const errors = [];
    try {
      const expected = j.file ? readFileSync(join(dir, j.file)) : null;
      const response = await fetch(new URL(j.path, base), { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
      const body = await readBounded(response, (expected?.length || 65_536) + 65_536);
      if (response.status !== (j.status || 200)) errors.push(`HTTP ${response.status}`);
      if (new URL(response.url).origin !== base.origin) errors.push('redirect ke origin lain');
      const type = response.headers.get('content-type') || '';
      const cache = response.headers.get('cache-control') || '';
      const csp = response.headers.get('content-security-policy') || '';
      if (expected && sha(body) !== sha(expected)) errors.push('SHA-256 isi berbeda dari dist');
      if (j.file && mime[extname(j.file)] && !mime[extname(j.file)].test(type)) errors.push(`MIME ${type}`);
      if (response.headers.get('x-content-type-options') !== 'nosniff') errors.push('nosniff hilang');
      if (response.headers.get('referrer-policy') !== 'no-referrer') errors.push('referrer-policy berbeda');
      if (!/default-src 'self'/.test(csp) || !/worker-src 'self'/.test(csp) || !/object-src 'none'/.test(csp)) errors.push('CSP tidak sesuai');
      if (j.path.startsWith('assets/') && !/immutable/.test(cache)) errors.push('cache immutable hilang');
      if (['', 'index.html', 'print', 'print.html'].includes(j.path) && !/no-cache/.test(cache)) errors.push('cache HTML tidak no-cache');
      let version = null;
      if (j.file === 'index.html') {
        version = /<meta\s+name="pf-version"\s+content="([^"]+)"/i.exec(body.toString('utf8'))?.[1] || null;
        if (version !== pkg.version) errors.push(`versi ${version}; perlu ${pkg.version}`);
      }
      results[index] = { path: j.path || '/', status: response.status, bytes: body.length,
        sha256: sha(body), mime: type, cache, version, pass: errors.length === 0, errors };
    } catch (error) {
      results[index] = { path: j.path || '/', pass: false, errors: [String(error.message || error)] };
    }
  }
}
try { await Promise.all(Array.from({ length: 4 }, worker)); }
finally { if (localServer) await new Promise((done) => localServer.close(done)); }
const result = { tool: 'scripts/verify-http.mjs', at: new Date().toISOString(), base: base.href,
  ...identity, expectedFiles: paths.length, filesCompared: results.filter((row, i) => jobs[i].file === jobs[i].path && row.sha256).length,
  pass: results.every((r) => r.pass), limitations: 'HTTP/bytes only; browser rendering, Worker execution, clipboard and PDF are not tested.', results };
mkdirSync(join(root, 'evidence'), { recursive: true });
const scope = localServer ? 'local' : encodeURIComponent(base.host);
writeFileSync(join(root, 'evidence', `http-verification-${scope}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(`${result.pass ? 'LULUS' : 'GAGAL'} HTTP: ${results.filter((r) => r.pass).length}/${results.length}; ${result.filesCompared}/${paths.length} berkas dibandingkan; versi ${pkg.version}`);
for (const r of results.filter((x) => !x.pass)) console.log(r.path, r.errors.join('; '));
process.exitCode = result.pass ? 0 : 1;

// Server statis lokal yang meniru aturan Cloudflare Pages yang relevan: _headers (pola path + wildcard),
// 404.html dengan status 404, index.html untuk direktori, tanpa fungsi/endpoint. Untuk smoke test & e2e lokal.
// Pemakaian: node scripts/serve-dist.mjs [dir=dist] [port=4173]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };

export function parseHeaders(text) {
  const rules = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':'); if (cur && i > 0) cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules.map((r) => ({ ...r, re: new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') }));
}

export function startServer(dir = 'dist', port = 4173) {
  const base = resolve(dir);
  const rules = existsSync(join(base, '_headers')) ? parseHeaders(readFileSync(join(base, '_headers'), 'utf8')) : [];
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (path.includes('\0') || path.includes('\\')) { res.writeHead(400); res.end(); return; }
    let file = resolve(base, '.' + path);
    const rel = relative(base, file);
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) { res.writeHead(400); res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) { file = join(file, 'index.html'); path = path.replace(/\/?$/, '/index.html'); }
    else if (!existsSync(file) && existsSync(file + '.html')) { file += '.html'; path += '.html'; }
    let status = 200;
    if (!existsSync(file) || path.endsWith('/_headers')) { status = 404; file = join(base, '404.html'); }
    const hdr = { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' };
    for (const r of rules) if (r.re.test(path) || (path.endsWith('/index.html') && r.re.test(path.replace(/index\.html$/, '')))) for (const [k, v] of r.headers) hdr[k] = v;
    const body = existsSync(file) ? readFileSync(file) : Buffer.from('not found');
    res.writeHead(status, hdr); res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = 'dist', port = '4173'] = process.argv.slice(2);
  await startServer(dir, Number(port));
  console.log(`PaperForma statis: http://127.0.0.1:${port}/ (${dir})`);
}

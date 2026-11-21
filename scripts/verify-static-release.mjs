// Verifikasi keluaran build sebagai situs statis Cloudflare Pages (tanpa backend).
// Pemakaian: node scripts/verify-static-release.mjs <dir> [--qa]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileList, root } from './fingerprint.mjs';

const dir = process.argv[2] || 'dist';
const qa = process.argv.includes('--qa');
const base = join(root, dir);
const files = fileList(dir);
const fail = [];
const must = ['index.html', 'print.html', '404.html', '_headers', 'favicon.svg', 'docs/panduan.html', 'licenses/THIRD_PARTY_NOTICES.txt', 'licenses/FONT_NOTICES.txt'];
for (const m of must) if (!files.includes(m)) fail.push(`berkas wajib hilang: ${m}`);
// MESIN-36: Worker analisis harus dibundel sebagai aset statis same-origin (CSP worker-src 'self')
if (!files.some((f) => /^assets\/engine\.worker-[\w-]+\.js$/.test(f))) fail.push('bundel Web Worker analisis (assets/engine.worker-*.js) hilang');
for (const f of files) {
  if (/(^|\/)(_worker\.js|_routes\.json|wrangler\.(toml|jsonc?)|\.env.*|.*\.pem|.*\.key)$/.test(f) || f.startsWith('functions/')) fail.push(`berkas backend/rahasia tidak boleh ada di dist: ${f}`);
  if (!qa && f.endsWith('.map')) fail.push(`source map di build produksi: ${f}`);
}
const text = (f) => readFileSync(join(base, f), 'utf8');
const js = files.filter((f) => f.endsWith('.js'));
const html = files.filter((f) => f.endsWith('.html'));
const all = [...js, ...html].map((f) => [f, text(f)]);
// Jalur backend dicari di seluruh bundel; kosakata komersial dicari di HTML dan teks UI milik aplikasi
// (pustaka pihak ketiga memuat kata seperti "checkout" untuk git/GraphQL — bukan fitur aplikasi).
const BACKEND = [[/\/api\/(pdf|jobs|account|auth|quota|checkout|billing)/i, 'endpoint API backend'], [/requestServerPdf|ServerPdfPayload|pdf-server/, 'jalur PDF server']];
for (const [f, s] of all) for (const [re, what] of BACKEND) { const m = re.exec(s); if (m) fail.push(`${what} di ${f}: “${m[0]}”`); }
const COMMERCIAL = [[/plans\.json|pricing|checkout|subscription|billing|langganan|berlangganan/i, 'harga/paket/langganan'], [/\bRp\s?\d|\/bulan\b|\/month\b|kuota\s+(PDF|bulanan)|monthly quota/i, 'harga/kuota komersial'], [/\b(sign in|log in|masuk akun|daftar akun|create account)\b/i, 'akun']];
const uiTexts = [...html.map((f) => [f, text(f)]), ...['src/ui/i18n.ts', 'src/ui/main.ts', 'index.html'].map((f) => [f, readFileSync(join(root, f), 'utf8')])];
for (const [f, s] of uiTexts) for (const [re, what] of COMMERCIAL) { const m = re.exec(s); if (m) fail.push(`${what} di ${f}: “${m[0]}”`); }
const QA_HOOKS = /__pfPrintResult|window\.__pf\b|pfPaginate/;
for (const [f, s] of all.filter(([f]) => f.endsWith('.js'))) {
  if (!qa && QA_HOOKS.test(s)) fail.push(`kait QA terekspos di build produksi: ${f}`);
}
if (qa && !all.some(([, s]) => /__pf/.test(s))) fail.push('build QA tidak memuat kait QA');
// tidak ada sumber daya eksternal yang dimuat halaman aplikasi
for (const f of html) {
  const s = text(f);
  const ext = /<(script|link|img|iframe)\b[^>]*\b(src|href)="(https?:)?\/\//i.exec(s);
  if (ext) fail.push(`sumber daya eksternal di ${f}: ${ext[0].slice(0, 80)}`);
}
const headers = text('_headers');
for (const h of ['Content-Security-Policy', "connect-src 'self'", 'X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'frame-ancestors']) if (!headers.includes(h)) fail.push(`_headers tanpa ${h}`);
const bytes = files.reduce((n, f) => n + statSync(join(base, f)).size, 0);
const summary = { dir, profile: qa ? 'qa' : 'production', files: files.length, bytes, maxFileBytes: Math.max(...files.map((f) => statSync(join(base, f)).size)) };
if (summary.files > 20000) fail.push('melebihi 20.000 berkas (batas Cloudflare Pages)');
if (summary.maxFileBytes > 25 * 1024 * 1024) fail.push('ada berkas > 25 MiB (batas Cloudflare Pages)');
if (!existsSync(base)) fail.push('direktori build tidak ada');
if (fail.length) { console.error('VERIFIKASI STATIS GAGAL:\n- ' + fail.join('\n- ')); process.exit(1); }
console.log('Verifikasi statis lulus: ' + JSON.stringify(summary));

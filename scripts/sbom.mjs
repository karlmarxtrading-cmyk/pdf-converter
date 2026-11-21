// R-03 / SEC-08 — generate release inventory (static site: runtime = dependencies bundled into dist) and distributable notices from the installed lockfile.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const lock = JSON.parse(read('package-lock.json'));
const pkg = JSON.parse(read('package.json'));
const direct = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
const licenses = [];
const components = [];
const publicDir = join(root, 'public/licenses');
mkdirSync(publicDir, { recursive: true });
mkdirSync(join(root, 'release'), { recursive: true });

const supplements = {
  'remark-math@6.0.0': () => 'https://github.com/remarkjs/remark-math/blob/6.0.0/license\n' +
    read('scripts/licenses/remark-math-MIT.txt'),
  'undici-types@5.26.5': () => read('scripts/licenses/undici-types-5.26.5-MIT.txt'),
};

for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = path.replace(/^.*node_modules\//, '');
  const required = !entry.dev;
  const dir = join(root, path);
  const installed = existsSync(join(dir, 'package.json'));
  const exactName = name + '@' + entry.version;
  let license = entry.license;
  let texts = [];
  if (installed) {
    const meta = JSON.parse(read(path + '/package.json'));
    if (meta.version !== entry.version) throw Error('Installed version differs from lockfile: ' + path);
    license ??= typeof meta.license === 'string' ? meta.license : meta.license?.type;
    const files = readdirSync(dir, {withFileTypes:true})
      .filter(f => f.isFile() && /^(licen[sc]e|unlicense|copying|notice)(?:[._-]|$)/i.test(f.name))
      .map(f => f.name).sort();
    texts = files.map(f => read(path + '/' + f).trim());
    if (!license && texts.some(t => /MIT License|Permission is hereby granted, free of charge/i.test(t))) license = 'MIT';
  }
  if (required) {
    if (!installed) throw Error('Missing runtime package: ' + exactName);
    if (!texts.length && supplements[exactName]) texts = [supplements[exactName]()];
    if (!texts.length) throw Error('No license text found for ' + exactName);
    licenses.push('## ' + exactName + ' — ' + (license ?? 'UNKNOWN') + '\n\n' + texts.join('\n\n') + '\n');
  }
  components.push({ type: 'library', name, version: entry.version, license: license ?? 'UNKNOWN',
    scope: required ? 'required' : 'excluded', direct: direct.has(name), integrity: entry.integrity ?? null,
    resolved: entry.resolved ?? null });
}
components.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const version = (n) => lock.packages['node_modules/' + n].version;
const families = ['@fontsource/inter', '@fontsource/source-serif-4', '@fontsource/jetbrains-mono'];
const katexVersion = version('katex');
const elkVersion = version('elkjs');
if (elkVersion !== '0.12.1') throw Error('Review elkjs upstream source reference for ' + elkVersion);
const source = 'https://github.com/kieler/elkjs/tree/624ae90aa37110033a8af59c5ccbb292708b4317';
const elkNotice = 'elkjs ' + elkVersion + ' is distributed unmodified under EPL-2.0. ' +
  'Source and build instructions for this release (tag ' + elkVersion + '): ' + source +
  '\nSource archive: https://github.com/kieler/elkjs/archive/624ae90aa37110033a8af59c5ccbb292708b4317.tar.gz';
const fontNotice = [
  '# PaperForma — Fonts and KaTeX stylesheet',
  ...families.map(n => n + '@' + version(n) + '\n' + read('node_modules/' + n + '/LICENSE').trim()),
  'KaTeX fonts @' + katexVersion + ' — SIL Open Font License 1.1\n' +
    read('scripts/licenses/katex-' + katexVersion + '-font-headers.txt').trim() +
    '\nThe full SIL Open Font License 1.1 is reproduced above.',
  'KaTeX stylesheet @' + katexVersion + '\n' + read('node_modules/katex/LICENSE').trim(),
].join('\n\n') + '\n';
const notices = '# Third-party notices — PaperForma ' + pkg.version + '\n\n' + elkNotice +
  '\n\n' + fontNotice + '\n\n' + licenses.join('\n---\n\n');
writeFileSync(join(publicDir,'THIRD_PARTY_NOTICES.txt'), notices);
writeFileSync(join(publicDir,'FONT_NOTICES.txt'), fontNotice);
writeFileSync(join(root,'release/THIRD_PARTY_NOTICES.md'), notices);
const fonts = [...families,'katex'].map(name => ({package: name, version: version(name), license:'OFL-1.1'}));
const counts = { total: components.length, runtime: licenses.length,
  unknownLicense: components.filter(c=>c.license === 'UNKNOWN').length };
const sbom = { bomFormat:'CycloneDX-lite', specVersion:'1.5-subset', app:{name:pkg.name,version:pkg.version},
  lockfileSha256:createHash('sha256').update(readFileSync(join(root,'package-lock.json'))).digest('hex'), counts, fonts, components };
writeFileSync(join(root,'release/SBOM.json'),JSON.stringify(sbom,null,1) + '\n');
console.log(JSON.stringify(counts));

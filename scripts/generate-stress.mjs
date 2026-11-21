#!/usr/bin/env node
// Port dari skrip audit generate_stress.py. Menghasilkan bagian sintetis; jumlah bagian BUKAN jumlah halaman PDF —
// halaman harus diukur setelah paginasi. Pemakaian: node scripts/generate-stress.mjs --sections 50 --output out.md
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function generateStress(sections) {
  if (!Number.isInteger(sections) || sections < 1 || sections > 1200) throw new Error('sections must be 1..1200');
  const pad = (n, w = 4) => String(n).padStart(w, '0');
  const parts = ['# Dokumen sintetis untuk uji panjang\n\nJumlah halaman harus diukur setelah pagination.\n'];
  for (let i = 1; i <= sections; i++) {
    parts.push(`\n## Bagian ${pad(i)}\n\nSTART_SECTION_${pad(i)}\n`);
    for (let j = 1; j <= 6; j++) parts.push(`Paragraf ${pad(i)}.${j}: ` + 'Kalimat contoh untuk memeriksa urutan, keterbacaan, dan pemecahan halaman. '.repeat(10) + '\n');
    let t = '| ID | Nilai |\n|---|---:|\n';
    for (let k = 1; k <= 8; k++) t += `| S${pad(i)}R${pad(k, 2)} | ${k % 3 === 0 ? -k : k} |\n`;
    parts.push(t);
    parts.push(`\nEND_SECTION_${pad(i)}\n`);
  }
  return parts.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const sections = Number(get('--sections', '50'));
  const out = get('--output', 'stress-input.md');
  const text = generateStress(sections);
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, text, 'utf8');
  console.log(`${out}: ${sections} sections, ${statSync(out).size} bytes; actual page count NOT MEASURED`);
}

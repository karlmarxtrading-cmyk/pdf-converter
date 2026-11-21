// Membuat fixture clipboard HTML dari dokumen Einstein:
//  chatgpt-katex.html   — markup KaTeX persis seperti yang dirender ChatGPT (anotasi application/x-tex),
//  chatgpt-literal.html — HTML dengan delimiter rumus sebagai teks literal (salinan tombol "copy"/teks belum dirender),
//  chatgpt-conversation.html — pembungkus percakapan data-message-author-role berisi markup KaTeX.
// Dibuat ulang: node fixtures/einstein/make-html.mjs (deterministik untuk versi KaTeX di lockfile).
import katex from 'katex';
import { writeFileSync } from 'node:fs';
const K = (tex, display = false) => katex.renderToString(tex, { displayMode: display, output: 'htmlAndMathml', throwOnError: true });
const M = {
  m: 'm', E0: 'E_0', boxed: '\\boxed{E_0=mc^2}', v: 'v', gamma: '\\gamma=\\frac{1}{\\sqrt{1-\\frac{v^2}{c^2}}}', Etot: 'E=\\gamma mc^2', dE: '\\Delta E = \\Delta m\\, c^2',
  matrix: '\\begin{pmatrix} ct\' \\\\ x\' \\end{pmatrix} = \\begin{pmatrix} \\gamma & -\\gamma\\beta \\\\ -\\gamma\\beta & \\gamma \\end{pmatrix} \\begin{pmatrix} ct \\\\ x \\end{pmatrix}',
  tau: '\\tau = \\int_{t_1}^{t_2} \\sqrt{1-\\frac{v(t)^2}{c^2}}\\,dt', E0eq: 'E_0=mc^2', p: 'p=\\gamma m v',
};
const body = (I, D) => `<h1>Relativitas khusus Einstein</h1>
<p>Energi diam sebuah benda bermassa ${I(M.m)} adalah ${I(M.E0)}:</p>
${D(M.boxed)}
<p>Untuk benda yang bergerak dengan kelajuan ${I(M.v)}, faktor Lorentz didefinisikan sebagai</p>
${D(M.gamma)}
<p>sehingga energi total menjadi ${I(M.Etot, '$')} dan perubahan energi memenuhi</p>
${D(M.dE, '$$')}
<ol><li><p>Transformasi Lorentz dalam bentuk matriks:</p>${D(M.matrix)}</li><li><p>Waktu sebagai integral: ${I(M.tau)}.</p></li></ol>
<table><thead><tr><th>Besaran</th><th>Rumus</th></tr></thead><tbody><tr><td>Energi diam</td><td>${I(M.E0eq)}</td></tr><tr><td>Momentum</td><td>${I(M.p, '$')}</td></tr></tbody></table>
<p>Biaya cetak buku ini $5 untuk versi hitam-putih dan $10 untuk versi berwarna.</p>
<pre><code class="language-bash">echo "\\(x\\) tetap teks, $HOME juga"</code></pre>
<p>Kode sebaris <code>$PATH</code> dan <code>\\[a\\]</code> tidak diubah. PENUTUP-EINSTEIN.</p>`;
const katexHtml = body((t) => K(t), (t) => `<p>${K(t, true)}</p>`);
// delimiter literal: inline \( \) atau $ $, display \[ \] (dengan <br> seperti salinan multi-baris) atau $$ $$
const lit = body((t, d) => (d === '$' ? `$${t}$` : `\\(${t}\\)`), (t, d) => (d === '$$' ? `<p>$$<br>${t}<br>$$</p>` : `<p>\\[${t}\\]</p>`));
writeFileSync(new URL('./chatgpt-katex.html', import.meta.url), `<div class="markdown prose">${katexHtml}</div>\n`);
writeFileSync(new URL('./chatgpt-literal.html', import.meta.url), `<div class="markdown prose">${lit}</div>\n`);
writeFileSync(new URL('./chatgpt-conversation.html', import.meta.url), `<div data-message-author-role="user"><div class="whitespace-pre-wrap">Jelaskan E=mc^2 dan faktor Lorentz.</div></div>\n<div data-message-author-role="assistant"><div class="markdown prose">${katexHtml}</div></div>\n`);
console.log('ok', katexHtml.length, lit.length);

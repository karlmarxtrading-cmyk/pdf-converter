/**
 * CSS dokumen PaperForma 2: dasar bersama (layar + cetak), struktur per templat, hemat tinta, aturan @page.
 * Porting dari "PaperForma document base" 1.0.0 dengan perbaikan: tidak ada keep-together pada blok panjang (PDF-06).
 */
import type { BrandKit, Settings, TemplateId } from '../core/contracts';
import { getTemplate, pageSizeMm, resolveStyle } from './templates';

export const FONT_STACKS = {
  'source-serif-4': `'Source Serif 4', 'Inter', 'JetBrains Mono', KaTeX_Main, KaTeX_AMS, Georgia, serif`,
  inter: `'Inter', 'Source Serif 4', 'JetBrains Mono', KaTeX_Main, KaTeX_AMS, Arial, sans-serif`,
  mono: `'JetBrains Mono', 'Inter', KaTeX_Main, KaTeX_AMS, Consolas, monospace`,
} as const;

export const BASE_CSS = `/* PaperForma document base 2 — dipakai semua templat, layar + cetak. */
:root {
  --pf-serif: ${FONT_STACKS['source-serif-4']};
  --pf-sans: ${FONT_STACKS.inter};
  --pf-mono: ${FONT_STACKS.mono};
  --pf-ink: #1b1d21; --pf-ink-soft: #4a4f57; --pf-rule: #c3c8cf; --pf-rule-soft: #e1e5e9; --pf-tint: #f3f5f7; --pf-paper: #ffffff;
  --pf-warn: #8a3b00; --pf-warn-bg: #fff6e5; --pf-err: #a1160a; --pf-err-bg: #fdf0ee;
  --pf-h1: 1.8; --pf-h2: 1.38; --pf-h3: 1.16; --pf-h4: 1.02;
  --pf-measure: 42rem; --pf-code-size: 9.5pt; --pf-small: .88em;
  --pf-gap: calc(var(--pf-size) * var(--pf-leading));
  --pf-accent-tint: color-mix(in srgb, var(--pf-accent) 9%, var(--pf-paper));
  --pf-accent-rule: color-mix(in srgb, var(--pf-accent) 45%, var(--pf-paper));
}
.pf-body { margin: 0; background: var(--pf-paper); color: var(--pf-ink); -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.pf-main, .pf-main * { text-align-last: auto; box-sizing: border-box; }
.pf-doc {
  font-family: var(--pf-body-font); font-size: var(--pf-size); line-height: var(--pf-leading); color: var(--pf-ink);
  font-kerning: normal; font-variant-numeric: proportional-nums; text-rendering: optimizeLegibility; hyphens: manual; overflow-wrap: break-word;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pf-doc > :first-child { margin-top: 0; }
.pf-doc p { margin: 0 0 calc(var(--pf-gap) * .7); }
.pf-doc h1, .pf-doc h2, .pf-doc h3, .pf-doc h4, .pf-doc h5, .pf-doc h6 {
  font-family: var(--pf-heading-font); font-weight: var(--pf-heading-weight); color: var(--pf-ink); line-height: 1.22;
  break-after: avoid; page-break-after: avoid; break-inside: avoid; text-wrap: balance; overflow-wrap: break-word;
}
.pf-doc h1 { font-size: calc(var(--pf-h1) * 1em); margin: 1.3em 0 .5em; letter-spacing: -.012em; }
.pf-doc h2 { font-size: calc(var(--pf-h2) * 1em); margin: 1.4em 0 .45em; }
.pf-doc h3 { font-size: calc(var(--pf-h3) * 1em); margin: 1.25em 0 .4em; }
.pf-doc h4 { font-size: calc(var(--pf-h4) * 1em); margin: 1.15em 0 .35em; }
.pf-doc h5, .pf-doc h6 { font-size: 1em; margin: 1.1em 0 .3em; }
.pf-doc h6 { font-style: italic; }
.pf-doc a { color: var(--pf-accent); text-decoration: underline; text-decoration-thickness: .06em; text-underline-offset: .15em; overflow-wrap: anywhere; }
.pf-doc strong, .pf-doc b { font-weight: var(--pf-strong-weight); }
.pf-doc mark { background: #fff1a8; color: inherit; padding: 0 .1em; }
.pf-doc sup, .pf-doc sub { line-height: 0; font-size: .75em; }
.pf-doc code, .pf-doc kbd, .pf-doc samp { font-family: var(--pf-mono); font-size: .88em; }
.pf-doc :not(pre) > code { background: var(--pf-tint); border: 1px solid var(--pf-rule-soft); border-radius: 3px; padding: .05em .3em; overflow-wrap: anywhere; }
.pf-doc ul, .pf-doc ol { margin: 0 0 calc(var(--pf-gap) * .7); padding-left: 1.6em; }
.pf-doc li { margin: .18em 0; }
.pf-doc li > p { margin-bottom: .3em; }
.pf-doc li > ul, .pf-doc li > ol { margin: .2em 0 .3em; }
.pf-doc .contains-task-list { list-style: none; padding-left: .3em; }
.pf-doc .task-list-item input[type=checkbox] { width: .9em; height: .9em; margin: 0 .45em 0 0; vertical-align: -.05em; }
.pf-doc blockquote { margin: 0 0 var(--pf-gap); padding: .1em 0 .1em 1.1em; border-left: 2px solid var(--pf-accent); color: var(--pf-ink-soft); box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.pf-doc blockquote > :last-child { margin-bottom: 0; }
.pf-doc hr { border: 0; border-top: 1px solid var(--pf-rule); margin: calc(var(--pf-gap) * 1.1) 0; }

/* kode: boleh pecah antarhalaman; pembungkusan hanya tampilan */
.pf-doc pre {
  font-family: var(--pf-mono); font-size: var(--pf-code-size); line-height: 1.5; background: var(--pf-tint); border: 1px solid var(--pf-rule-soft);
  border-radius: 4px; padding: .75em .95em; margin: 0 0 var(--pf-gap); tab-size: 4; white-space: pre; overflow-x: auto;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
.pf-doc pre code { background: none; border: 0; padding: 0; font-size: 1em; white-space: inherit; }
.pf-doc pre[data-lang]::before { content: attr(data-lang); display: block; font-family: var(--pf-sans); font-size: 8.5pt; font-weight: 600; color: var(--pf-ink-soft); margin-bottom: .45em; letter-spacing: .03em; text-transform: uppercase; user-select: none; }
.pf-doc pre:focus-visible, .pf-doc .pf-table-wrap:focus-visible, .pf-doc .pf-math-block:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }
.pf-print .pf-doc pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; }

/* tabel: baris boleh berpindah halaman; header diulang oleh mesin paginasi */
.pf-doc .pf-table-wrap { margin: 0 0 var(--pf-gap); overflow-x: auto; max-width: 100%; }
.pf-doc table { border-collapse: collapse; width: 100%; font-size: .92em; line-height: 1.4; font-variant-numeric: tabular-nums; }
.pf-doc th, .pf-doc td { border-bottom: 1px solid var(--pf-rule-soft); padding: .42em .6em; text-align: left; vertical-align: top; overflow-wrap: break-word; }
.pf-doc th { font-weight: var(--pf-strong-weight); border-bottom: 1.5px solid var(--pf-ink); }
.pf-doc thead { display: table-header-group; break-after: avoid; }
.pf-doc tr { break-inside: avoid; }
.pf-doc caption { caption-side: top; text-align: left; font-size: .92em; color: var(--pf-ink-soft); padding-bottom: .4em; break-after: avoid; }
.pf-doc td[align=right], .pf-doc th[align=right], .pf-doc td[style*="text-align: right"], .pf-doc th[style*="text-align:right"] { text-align: right; }
.pf-doc td[align=center], .pf-doc th[align=center] { text-align: center; }
.pf-print .pf-doc .pf-table-wrap { overflow: visible; }
.pf-print .pf-doc table.pf-fit-1 { table-layout: auto; }
.pf-print .pf-doc table.pf-fit-1 th, .pf-print .pf-doc table.pf-fit-1 td { padding: .32em .38em; }
.pf-print .pf-doc table.pf-fit-2 { font-size: 8.5pt; }
.pf-print .pf-doc table.pf-fit-3 { table-layout: fixed; }
.pf-print .pf-doc table.pf-fit-3 th, .pf-print .pf-doc table.pf-fit-3 td { overflow-wrap: anywhere; }
.pf-print .pf-doc table[data-split-from] > thead[data-pf-repeat] th { border-top: 0; }
.pf-doc .pf-table-stacked { font-size: .95em; }
.pf-doc .pf-stack-row { border-bottom: 1px solid var(--pf-rule); padding: .35em 0; }
.pf-doc .pf-stack-row:first-of-type { border-top: 1.5px solid var(--pf-ink); }
.pf-doc .pf-stack-cell { padding: .1em 0; overflow-wrap: anywhere; }
.pf-doc .pf-stack-cell[data-label]::before { content: attr(data-label); display: block; font-family: var(--pf-sans); font-size: 8.5pt; font-weight: 600; color: var(--pf-ink-soft); }
.pf-doc .pf-table-stacked [data-section="thead"] { font-weight: 600; }
.pf-doc .pf-table-stacked [data-section="tfoot"] { border-top: 1px solid var(--pf-ink); }
.pf-doc .pf-stack-caption { font-size: .92em; color: var(--pf-ink-soft); padding-bottom: .4em; }
.pf-doc table.pf-measure-nobreak th, .pf-doc table.pf-measure-nobreak td { overflow-wrap: normal !important; word-break: normal !important; hyphens: none !important; }
/* dicocokkan Paged.js pada fragmen isi tanpa <body>: jangan beri prefiks kelas body */
.pf-force-break { break-before: page; }
.pf-doc tr.pf-force-break { break-before: page; }
.pf-print .pf-doc p, .pf-print .pf-doc li { orphans: 2; widows: 2; }
.pf-doc pre.pf-keep { break-inside: avoid; }
.pf-doc pre.pf-lines .pf-line { display: block; min-height: 1.5em; }
.pf-doc .pf-table-split { margin: 0 0 1em; }
.pf-doc .pf-table-part + .pf-table-part { margin-top: .9em; }
.pf-doc .pf-split-caption { caption-side: top; text-align: left; font-size: max(.88em, 8.5pt); color: var(--pf-ink-soft); padding-bottom: .3em; }
.pf-doc .pf-split-note { font-style: italic; }
/* PF-R4-08: repeat-key tint applies to body cells; headers keep their template contrast pair. */
.pf-doc td.pf-repeat-key { background: var(--pf-tint, rgba(0,0,0,.035)); }

/* gambar & diagram: rasio aspek selalu dipertahankan */
.pf-doc figure { margin: 0 0 var(--pf-gap); text-align: center; break-inside: avoid; }
.pf-doc img, .pf-doc svg:not(.katex *) { max-width: 100%; height: auto; }
.pf-doc figure img, .pf-doc figure > svg, .pf-doc p > img:only-child { display: block; margin: 0 auto; object-fit: contain; }
.pf-print .pf-doc img, .pf-print .pf-doc figure > svg, .pf-print .pf-doc .pf-mermaid svg { max-height: calc(var(--pf-content-h) * .72); width: auto; object-fit: contain; }
.pf-doc figcaption { font-size: var(--pf-small); color: var(--pf-ink-soft); margin-top: .5em; text-align: center; break-before: avoid; }
.pf-doc .pf-mermaid svg { max-width: 100%; height: auto; }
.pf-doc .pf-mermaid-failed { text-align: left; border: 1px dashed var(--pf-warn); padding: .6em .8em; break-inside: auto; }
.pf-doc .pf-mermaid-failed > figcaption { text-align: left; color: var(--pf-warn); font-family: var(--pf-sans); font-weight: 600; margin: 0 0 .5em; }
.pf-doc .pf-missing-asset { display: inline-block; border: 1px dashed var(--pf-warn); color: var(--pf-warn); background: var(--pf-warn-bg); padding: .45em .75em; font-family: var(--pf-sans); font-size: .85em; border-radius: 3px; overflow-wrap: anywhere; }

/* matematika */
.pf-doc .katex { font-size: 1.06em; }
/* PF-R4-03: KaTeX fallback script text uses the same bundled Unicode faces as prose. */
.pf-doc .katex [class*="_fallback"] { font-family: var(--pf-sans); }
.pf-doc .pf-math-block { margin: .3em 0 var(--pf-gap); overflow-x: auto; overflow-y: hidden; break-inside: avoid; }
.pf-doc .katex-display { margin: .4em 0; }
.pf-print .pf-doc .pf-math-block { overflow: visible; }
.pf-doc .pf-math-error { font-family: var(--pf-mono); font-size: .85em; color: var(--pf-err); background: var(--pf-err-bg); border-bottom: 1px dashed var(--pf-err); white-space: pre-wrap; overflow-wrap: anywhere; }
.pf-doc div.pf-math-error { display: block; padding: .5em .8em; margin: 0 0 var(--pf-gap); }

/* catatan kaki / catatan akhir */
.pf-doc .footnotes { margin-top: calc(var(--pf-gap) * 1.5); padding-top: .6em; border-top: 1px solid var(--pf-rule); font-size: var(--pf-small); }
.pf-doc .footnotes > h2, .pf-doc .pf-footnotes-label { font-size: 1.05em; margin: 0 0 .5em; position: static; width: auto; height: auto; clip: auto; clip-path: none; overflow: visible; white-space: normal; }
.pf-doc [data-footnote-ref] { text-decoration: none; font-variant-numeric: lining-nums; padding: 0 .1em; }
.pf-doc [data-footnote-backref] { text-decoration: none; font-family: var(--pf-sans); }
.pf-doc :target { scroll-margin-top: 1rem; }
.pf-screen .pf-doc li:target, .pf-screen .pf-doc sup:target, .pf-screen .pf-doc :is(h1,h2,h3,h4,h5,h6):target { background: var(--pf-accent-tint); outline: 2px solid var(--pf-accent-rule); outline-offset: 2px; }

/* blok judul (tanpa sampul) */
.pf-titleblock { margin: 0 0 calc(var(--pf-gap) * 1.5); }
.pf-titleblock-title { font-family: var(--pf-heading-font); font-size: 2em; font-weight: var(--pf-heading-weight); line-height: 1.15; margin: 0 0 .25em; text-wrap: balance; }
.pf-titleblock-sub { font-size: 1.15em; color: var(--pf-ink-soft); margin: 0 0 .5em; }
.pf-titleblock-by { color: var(--pf-ink-soft); margin: 0; font-family: var(--pf-sans); font-size: .9em; }
.pf-brandline { display: flex; align-items: center; gap: .6em; font-family: var(--pf-sans); font-size: .85em; font-weight: 600; color: var(--pf-accent); margin: 0 0 1.1em; }
.pf-logo { max-height: 14mm; max-width: 45mm; width: auto; height: auto; object-fit: contain; }
.pf-screen .pf-logo { max-height: 3rem; max-width: 10rem; }

/* daftar isi */
.pf-toc { margin: 0 0 calc(var(--pf-gap) * 1.5); }
.pf-toc-title { font-family: var(--pf-heading-font); font-size: 1.3em; font-weight: var(--pf-heading-weight); margin: 0 0 .6em; }
.pf-toc ol { list-style: none; padding: 0; margin: 0; }
.pf-toc li { margin: .2em 0; }
.pf-toc a { display: flex; align-items: baseline; gap: .4em; color: var(--pf-ink); text-decoration: none; }
.pf-toc .pf-toc-text { flex: 0 1 auto; overflow-wrap: anywhere; }
.pf-toc .pf-toc-dots { flex: 1 1 1em; border-bottom: 1px dotted var(--pf-rule); min-width: 1em; transform: translateY(-.25em); }
.pf-toc .pf-toc-page { flex: 0 0 2.6em; font-variant-numeric: tabular-nums lining-nums; text-align: right; font-family: var(--pf-sans); font-size: .92em; }
.pf-toc-l1 { font-weight: var(--pf-strong-weight); }
.pf-toc-l2 { padding-left: 1.2em; }
.pf-toc-l3 { padding-left: 2.4em; font-size: .95em; }
.pf-screen .pf-toc .pf-toc-dots, .pf-screen .pf-toc .pf-toc-page { display: none; }
.pf-screen .pf-toc a { display: block; padding: .3em 0; text-decoration: underline; text-decoration-color: var(--pf-accent-rule); }
.pf-screen details.pf-nav { border: 1px solid var(--pf-rule-soft); border-radius: 6px; padding: .6em 1em; margin: 0 0 calc(var(--pf-gap) * 1.2); }
.pf-screen details.pf-nav > summary { cursor: pointer; font-family: var(--pf-heading-font); font-weight: var(--pf-heading-weight); padding: .35em 0; min-height: 24px; }
.pf-print details.pf-nav > summary { display: none; }

/* sampul */
.pf-cover { page: pf-cover; break-after: page; }
.pf-cover-kind { font-family: var(--pf-sans); color: var(--pf-accent); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: .8em; margin: 0 0 1.2em; }
.pf-cover-title { font-family: var(--pf-heading-font); font-size: 2.5em; line-height: 1.1; margin: 0 0 .35em; font-weight: var(--pf-heading-weight); letter-spacing: -.015em; text-wrap: balance; overflow-wrap: break-word; }
.pf-cover-subtitle { font-size: 1.25em; color: var(--pf-ink-soft); margin: 0 0 2em; }
.pf-cover-by { display: flex; flex-direction: column; gap: .2em; font-size: 1.05em; }
.pf-cover-date { color: var(--pf-ink-soft); margin: .4em 0 0; }
.pf-cover-foot { margin-top: auto; display: flex; align-items: center; gap: .8em; font-family: var(--pf-sans); font-size: .9em; color: var(--pf-ink-soft); }
.pf-screen .pf-cover { padding: 2.5rem 0 2rem; border-bottom: 1px solid var(--pf-rule); margin-bottom: 2.5rem; }
.pf-print .pf-cover { height: var(--pf-page-h); width: var(--pf-page-w); box-sizing: border-box; display: flex; font-family: var(--pf-body-font); font-size: var(--pf-size); line-height: var(--pf-leading); color: var(--pf-ink); padding: 0; overflow: hidden; }
.pf-print .pf-cover-inner { display: flex; flex-direction: column; width: 100%; padding: 34% calc(var(--pf-m-right) + 4mm) calc(var(--pf-m-bottom) + 4mm) calc(var(--pf-m-left) + 4mm); border-top: 7mm solid var(--pf-accent); }

/* percakapan (semua templat): label pembicara di atas isi; CON-01 menimpa untuk cetak */
.pf-msg { margin: 0 0 var(--pf-gap); padding-top: calc(var(--pf-gap) * .6); border-top: 1px solid var(--pf-rule); }
.pf-msg:first-of-type { border-top: 0; padding-top: 0; }
.pf-msg-speaker { font-family: var(--pf-sans); font-size: .82em; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--pf-accent); margin: 0 0 .35em; break-after: avoid; }
.pf-msg-speaker .pf-msg-meta { display: block; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--pf-ink-soft); }
.pf-msg-body > :last-child { margin-bottom: 0; }

/* penanda pemutus halaman manual */
.pf-doc .pf-page-break { break-after: page; height: 0; margin: 0; }
.pf-screen .pf-doc .pf-page-break { border-top: 1px dashed var(--pf-rule); margin: 2em 0; }
.pf-doc .pf-callout, .pf-doc .pf-summary { box-decoration-break: clone; -webkit-box-decoration-break: clone; }

/* layar */
.pf-screen .pf-main { max-width: calc(var(--pf-measure) + 2.5rem); margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
.pf-screen .pf-doc { font-size: clamp(1rem, calc(.96rem + .3vw), 1.125rem); --pf-gap: calc(1em * var(--pf-leading)); --pf-code-size: .86em; }
.pf-screen .pf-doc table { min-width: min(100%, 22rem); }
.pf-screen .pf-doc .pf-table-wrap { border: 1px solid var(--pf-rule-soft); border-radius: 4px; }
.pf-screen .pf-doc .pf-table-wrap table { width: max-content; min-width: 100%; }
.pf-screen .pf-doc .pf-table-wrap td, .pf-screen .pf-doc .pf-table-wrap th { max-width: 28rem; }
.pf-skip { position: absolute; left: -999rem; top: 0; background: var(--pf-paper); color: var(--pf-ink); padding: .6em 1em; z-index: 5; }
.pf-skip:focus { left: .5rem; top: .5rem; outline: 2px solid var(--pf-accent); }
.pf-docfoot { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--pf-rule); font-family: var(--pf-sans); font-size: .8rem; color: var(--pf-ink-soft); display: flex; gap: .8em; align-items: center; flex-wrap: wrap; }
@media screen and (max-width: 600px) { .pf-screen .pf-main { padding: 1.25rem 1rem 3rem; } .pf-cover-title { font-size: 2em; } .pf-doc h1 { font-size: 1.6em; } }
@media screen and (prefers-color-scheme: dark) {
  .pf-screen.pf-adaptive { --pf-paper: #14171b; --pf-ink: #e8eaed; --pf-ink-soft: #b4bac3; --pf-rule: #3b424b; --pf-rule-soft: #2a3038; --pf-tint: #1d2228; --pf-warn: #ffb866; --pf-warn-bg: #2b2010; --pf-err: #ff9a8f; --pf-err-bg: #2d1613; --pf-accent: color-mix(in srgb, var(--pf-accent-base) 45%, #ffffff); color-scheme: dark; }
  .pf-screen.pf-adaptive .pf-doc mark { background: #5c4d00; }
  .pf-screen.pf-adaptive .pf-doc figure img, .pf-screen.pf-adaptive .pf-doc .pf-mermaid svg, .pf-screen.pf-adaptive .pf-logo { background: #fff; border-radius: 3px; }
}
/* HTML dicetak langsung dari peramban (HTM-06): navigasi layar tidak ikut tercetak */
@media print {
  .pf-screen .pf-main { max-width: none; padding: 0; }
  .pf-screen .pf-doc { font-size: var(--pf-size); --pf-code-size: 9.5pt; }
  .pf-screen .pf-skip, .pf-screen .pf-screen-only, .pf-screen details.pf-nav, .pf-screen .pf-copy { display: none !important; }
  .pf-screen .pf-doc pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; }
  .pf-screen .pf-doc .pf-table-wrap, .pf-screen .pf-doc .pf-math-block { overflow: visible; border: 0; }
  .pf-screen .pf-doc .pf-table-wrap table { width: 100%; }
  .pf-screen .pf-doc a { color: inherit; }
  .pf-screen .pf-cover { break-after: page; }
}
/* kotak margin halaman */
.pagedjs_margin-content { font-family: var(--pf-sans); font-size: 8.5pt; color: var(--pf-ink-soft); letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pagedjs_margin-top-left > .pagedjs_margin-content, .pagedjs_margin-top-right > .pagedjs_margin-content, .pagedjs_margin-top-center > .pagedjs_margin-content { align-self: center; }
.pf-page-opener .pagedjs_margin-top, .pf-page-toc .pagedjs_margin-top { visibility: hidden; }
`;

/** Tema sorotan kode ringkas: tanpa cetak tebal/miring agar hanya satu berkas mono yang disematkan. */
export const HLJS_CSS = `.pf-doc .hljs-comment, .pf-doc .hljs-quote, .pf-doc .hljs-meta { color: #5c6570; }
.pf-doc .hljs-keyword, .pf-doc .hljs-selector-tag, .pf-doc .hljs-built_in, .pf-doc .hljs-type { color: #8a2f6b; }
.pf-doc .hljs-string, .pf-doc .hljs-regexp, .pf-doc .hljs-symbol, .pf-doc .hljs-addition { color: #1f6b3a; }
.pf-doc .hljs-number, .pf-doc .hljs-literal, .pf-doc .hljs-attr, .pf-doc .hljs-attribute { color: #1d5a96; }
.pf-doc .hljs-title, .pf-doc .hljs-section, .pf-doc .hljs-name, .pf-doc .hljs-function { color: #7a4a00; }
.pf-doc .hljs-deletion { color: #a1160a; }
.pf-doc .hljs-emphasis, .pf-doc .hljs-strong { font-style: normal; font-weight: inherit; }
@media screen and (prefers-color-scheme: dark) { .pf-screen.pf-adaptive .pf-doc [class^="hljs-"] { filter: brightness(1.9) saturate(.8); } }
.pf-ink-saver .pf-doc [class^="hljs-"] { color: inherit; }
`;

export const TEMPLATE_CSS: Record<TemplateId, string> = {
  /* EDU-01 — Modul Belajar: blok konsep/contoh/latihan selebar teks, label tertulis + bentuk garis berbeda (bukan warna saja) */
  'EDU-01': `
.pf-t-EDU-01 { --pf-h1: 1.9; --pf-h2: 1.36; --pf-h3: 1.14; }
.pf-t-EDU-01 h1 { padding-top: .5em; border-top: 5px solid var(--pf-accent); }
.pf-t-EDU-01 h2 { color: var(--pf-accent); padding-bottom: .2em; border-bottom: 1px solid var(--pf-accent-rule); }
.pf-t-EDU-01 blockquote { color: var(--pf-ink); }
.pf-t-EDU-01 .pf-callout { border: 1px solid var(--pf-accent-rule); border-left: 5px solid var(--pf-accent); border-radius: 0 4px 4px 0; background: var(--pf-accent-tint); padding: .7em 1em .75em; margin: calc(var(--pf-gap) * .8) 0 calc(var(--pf-gap) * 1.1); }
.pf-t-EDU-01 .pf-callout .pf-callout-label { font-family: var(--pf-sans); font-weight: 700; color: var(--pf-accent); letter-spacing: .02em; }
.pf-t-EDU-01 .pf-callout-example { background: none; border-left-style: double; border-left-width: 6px; }
.pf-t-EDU-01 .pf-callout-exercise { background: none; border-style: dashed; border-left-style: solid; }
.pf-t-EDU-01 .pf-callout-note { background: var(--pf-tint); border-color: var(--pf-rule); border-left-color: var(--pf-ink-soft); }
.pf-t-EDU-01 .pf-callout-note .pf-callout-label { color: var(--pf-ink); }
.pf-t-EDU-01 .pf-callout-summary { border-left-width: 1px; border-top: 3px solid var(--pf-accent); border-radius: 0; }
.pf-t-EDU-01 .pf-label-heading { font-family: var(--pf-sans); font-size: 1em; color: var(--pf-accent); margin-top: 1.3em; padding-left: .6em; border-left: 5px solid var(--pf-accent); }
.pf-t-EDU-01 .pf-label-heading.pf-kind-example { border-left-style: double; border-left-width: 6px; }
.pf-t-EDU-01 .pf-label-heading.pf-kind-exercise { border-left-style: dashed; }
.pf-t-EDU-01 th { background: var(--pf-accent-tint); border-bottom: 1.5px solid var(--pf-accent); }
.pf-t-EDU-01 .pf-math-block { padding: .15em 0; }
.pf-ink-saver .pf-t-EDU-01 .pf-callout, .pf-ink-saver .pf-t-EDU-01 th { background: none; }
`,
  /* BUS-01 — Laporan Eksekutif: panel ringkasan, kartu metrik (dari daftar bertanda), tabel bukti selebar halaman */
  'BUS-01': `
.pf-t-BUS-01 { --pf-h1: 1.7; --pf-h2: 1.3; --pf-h3: 1.1; --pf-h4: 1; }
.pf-t-BUS-01 h1 { letter-spacing: -.018em; padding-bottom: .3em; border-bottom: 3px solid var(--pf-accent); }
.pf-t-BUS-01 h2 { padding-left: .55em; border-left: 4px solid var(--pf-accent); }
.pf-t-BUS-01 h3 { color: var(--pf-accent); }
.pf-t-BUS-01 h4 { color: var(--pf-ink-soft); text-transform: uppercase; letter-spacing: .04em; font-size: .86em; }
.pf-t-BUS-01 .pf-summary { background: var(--pf-accent-tint); border-top: 3px solid var(--pf-accent); padding: .9em 1.1em 1em; margin: 0 0 calc(var(--pf-gap) * 1.3); font-size: 1.04em; }
.pf-t-BUS-01 .pf-summary > :is(h1,h2,h3,h4):first-child { margin-top: 0; border: 0; padding-left: 0; color: var(--pf-accent); font-size: 1.15em; text-transform: uppercase; letter-spacing: .05em; }
.pf-t-BUS-01 .pf-summary > :last-child { margin-bottom: 0; }
.pf-t-BUS-01 ul.pf-metrics { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 0 0 calc(var(--pf-gap) * 1.1); break-inside: avoid; }
.pf-t-BUS-01 ul.pf-metrics > li { margin: 0; border: 1px solid var(--pf-rule); border-top: 3px solid var(--pf-accent); padding: .6em .75em .7em; font-size: .9em; color: var(--pf-ink-soft); overflow-wrap: break-word; }
.pf-t-BUS-01 ul.pf-metrics > li > strong:first-child, .pf-t-BUS-01 ul.pf-metrics > li > p > strong:first-child { display: block; font-size: 1.45em; overflow-wrap: break-word; line-height: 1.15; color: var(--pf-ink); font-variant-numeric: tabular-nums lining-nums; margin-bottom: .15em; }
.pf-t-BUS-01 ul.pf-metrics > li > p { margin: 0; }
.pf-screen .pf-t-BUS-01 ul.pf-metrics { grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: .75rem; }
.pf-t-BUS-01 table { font-size: .9em; }
.pf-t-BUS-01 th { background: var(--pf-accent); color: #fff; border-bottom: 0; }
.pf-t-BUS-01 tbody tr:nth-child(even) td { background: var(--pf-tint); }
.pf-t-BUS-01 td { border-bottom: 1px solid var(--pf-rule-soft); }
.pf-t-BUS-01 blockquote { border-left-width: 4px; background: var(--pf-tint); padding: .7em 1em; color: var(--pf-ink); }
.pf-print .pf-tmain-BUS-01 .pf-cover-inner { border-top: 0; padding-top: 0; }
.pf-print .pf-tmain-BUS-01 .pf-cover-inner::before { content: ""; display: block; height: 34%; flex: none; margin: 0 calc(-1 * (var(--pf-m-right) + 4mm)) 12mm calc(-1 * (var(--pf-m-left) + 4mm)); background: var(--pf-accent); }
.pf-ink-saver .pf-t-BUS-01 th { background: none; color: var(--pf-ink); border-top: 1.5px solid var(--pf-ink); border-bottom: 1.5px solid var(--pf-ink); }
.pf-ink-saver .pf-t-BUS-01 tbody tr:nth-child(even) td, .pf-ink-saver .pf-t-BUS-01 .pf-summary, .pf-ink-saver .pf-t-BUS-01 blockquote { background: none; }
.pf-ink-saver.pf-print .pf-tmain-BUS-01 .pf-cover-inner::before { background: none; border-bottom: 2px solid var(--pf-ink); }
`,
  /* EDT-01 — Esai dan Bab Panjang: tipografi buku A5, pembuka bab, kutipan masuk, catatan akhir */
  'EDT-01': `
.pf-t-EDT-01 { --pf-h1: 1.75; --pf-h2: 1.22; --pf-h3: 1.06; --pf-h4: 1; --pf-ink: #1a1714; font-variant-numeric: oldstyle-nums proportional-nums; }
.pf-t-EDT-01 p { margin: 0; text-align: justify; hyphens: auto; }
.pf-t-EDT-01 p.pf-indent { text-indent: 1.5em; }
.pf-t-EDT-01 :is(ul, ol, blockquote, pre, figure, .pf-table-wrap, .pf-math-block, table) { margin-top: calc(var(--pf-gap) * .6); margin-bottom: calc(var(--pf-gap) * .6); }
.pf-t-EDT-01 :is(li, td, th, blockquote, figcaption) p { text-indent: 0; }
.pf-t-EDT-01 li p, .pf-t-EDT-01 td p { text-align: left; }
.pf-t-EDT-01 h1 { font-weight: 600; text-align: center; letter-spacing: 0; margin: 0 0 1.6em; }
.pf-t-EDT-01 h1::after { content: ""; display: block; width: 18mm; height: 0; border-top: 1px solid var(--pf-accent); margin: .7em auto 0; }
.pf-t-EDT-01 h2 { font-weight: 600; font-style: italic; margin: 1.7em 0 .6em; }
.pf-t-EDT-01 h3 { font-variant-caps: all-small-caps; letter-spacing: .06em; font-weight: 600; font-size: 1.1em; color: var(--pf-accent); }
.pf-t-EDT-01 h1 + p::first-line, .pf-t-EDT-01 .pf-chapter-first::first-line { font-variant-caps: small-caps; letter-spacing: .03em; }
.pf-print .pf-t-EDT-01 h1.pf-chapter-opener { padding-top: 24mm; }
.pf-screen .pf-t-EDT-01 h1.pf-chapter-opener { margin-top: 2.2em; }
.pf-t-EDT-01 blockquote { border-left: 0; padding: 0 0 0 1.5em; margin-left: 0; margin-right: 1.5em; color: var(--pf-ink); font-size: 1em; font-style: italic; }
.pf-t-EDT-01 blockquote em, .pf-t-EDT-01 blockquote i { font-style: normal; }
.pf-t-EDT-01 hr { border: 0; text-align: center; margin: calc(var(--pf-gap) * 1.2) 0; }
.pf-t-EDT-01 hr::after { content: "* * *"; color: var(--pf-accent); letter-spacing: .5em; }
.pf-t-EDT-01 a { color: inherit; text-decoration-color: var(--pf-accent); }
.pf-t-EDT-01 th { border-top: 1.5px solid var(--pf-ink); border-bottom: 1px solid var(--pf-ink); }
.pf-t-EDT-01 tbody tr:last-child td { border-bottom: 1.5px solid var(--pf-ink); }
.pf-t-EDT-01 td { border-bottom: 0; }
.pf-t-EDT-01 .footnotes { border-top: 0; font-size: .9em; }
.pf-print .pf-t-EDT-01 .footnotes { margin-top: 0; padding-top: 0; }
.pf-t-EDT-01 .footnotes > h2, .pf-t-EDT-01 .pf-footnotes-label { font-style: normal; font-size: 1.4em; text-align: center; margin: 0 0 1.2em; }
.pf-t-EDT-01 .footnotes p { text-align: left; hyphens: manual; }
.pf-t-EDT-01 .pf-titleblock { text-align: center; margin-bottom: calc(var(--pf-gap) * 2); }
.pf-t-EDT-01 .pf-titleblock-by { font-family: var(--pf-body-font); font-style: italic; font-size: 1em; }
.pf-t-EDT-01 .pf-brandline { justify-content: center; }
.pf-print .pf-tmain-EDT-01 .pf-cover-inner { border-top: 0; text-align: center; align-items: center; padding-top: 38%; }
.pf-print .pf-tmain-EDT-01 .pf-cover-title { font-weight: 600; }
.pf-print .pf-tmain-EDT-01 .pf-cover-title::after { content: ""; display: block; width: 18mm; border-top: 1px solid var(--pf-accent); margin: .6em auto 0; }
.pf-print .pf-tmain-EDT-01 .pf-cover-foot { flex-direction: column; }
.pf-screen .pf-t-EDT-01 p { text-align: left; hyphens: manual; }
`,
  /* CON-01 — Transkrip: gutter pembicara 24 mm + sela 6 mm + isi 144 mm; label lanjutan saat pesan berpindah halaman */
  'CON-01': `
.pf-t-CON-01 { --pf-h1: 1.45; --pf-h2: 1.22; --pf-h3: 1.08; --pf-h4: 1; --pf-gutter: 24mm; --pf-gutter-gap: 6mm; }
.pf-t-CON-01 .pf-msg { border-top: 1px solid var(--pf-rule); padding-top: calc(var(--pf-gap) * .65); margin-bottom: calc(var(--pf-gap) * .65); }
.pf-t-CON-01 .pf-msg-speaker { color: var(--pf-ink); }
.pf-t-CON-01 .pf-msg[data-role="user"] .pf-msg-speaker { font-weight: 700; }
.pf-t-CON-01 .pf-msg[data-role="user"] .pf-msg-body { border-left: 2px solid var(--pf-accent); padding-left: 3mm; }
.pf-t-CON-01 .pf-msg[data-role-confidence="low"] .pf-msg-speaker, .pf-t-CON-01 .pf-msg[data-role-confidence="unknown"] .pf-msg-speaker { font-style: italic; }
.pf-t-CON-01 .pf-msg-body :is(h1,h2,h3,h4) { margin-top: .9em; }
.pf-t-CON-01 .pf-msg-body > :first-child { margin-top: 0; }
.pf-t-CON-01 th { background: var(--pf-tint); border-bottom: 1.5px solid var(--pf-accent); }
.pf-print .pf-t-CON-01 .pf-msg[data-speaker] { position: relative; padding-left: calc(var(--pf-gutter) + var(--pf-gutter-gap)); min-height: 2.6em; }
.pf-print .pf-t-CON-01 .pf-msg-speaker { position: absolute; left: 0; top: calc(var(--pf-gap) * .65); width: var(--pf-gutter); margin: 0; font-size: 8.5pt; line-height: 1.3; overflow-wrap: anywhere; hyphens: auto; }
.pf-print .pf-t-CON-01 .pf-msg[data-split-from] { border-top: 0; padding-top: 0; }
.pf-print .pf-t-CON-01 .pf-msg[data-speaker][data-split-from]::before { position: absolute; left: 0; top: 0; width: var(--pf-gutter); font-family: var(--pf-sans); font-size: 8.5pt; line-height: 1.3; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--pf-ink-soft); overflow-wrap: anywhere; }
.pf-print .pf-t-CON-01 .pf-msg-body > .pf-wide { margin-left: calc(-1 * (var(--pf-gutter) + var(--pf-gutter-gap))); }
.pf-print .pf-t-CON-01 .pf-msg[data-role="user"] .pf-msg-body > .pf-wide { margin-left: calc(-1 * (var(--pf-gutter) + var(--pf-gutter-gap) + 3mm + 2px)); }
.pf-print .pf-t-CON-01 .pf-msg-body > .pf-wide::before { content: attr(data-speaker-note); display: block; font-family: var(--pf-sans); font-size: 8.5pt; color: var(--pf-ink-soft); margin: 0 0 .3em; text-transform: none; letter-spacing: 0; font-weight: 400; }
.pf-ink-saver .pf-t-CON-01 th { background: none; }
`,
};

export const INK_SAVER_CSS = `/* Profil hemat tinta: tanpa bidang warna; pembeda memakai garis dan label teks. */
.pf-ink-saver { --pf-accent: #1b1d21 !important; --pf-tint: #ffffff; --pf-accent-tint: #ffffff; --pf-accent-rule: #6b7078; --pf-ink-soft: #33373d; }
.pf-ink-saver .pf-doc pre, .pf-ink-saver .pf-doc :not(pre) > code { background: none; }
.pf-ink-saver .pf-doc mark { background: none; text-decoration: underline; text-decoration-style: double; }
.pf-ink-saver .pf-doc a { color: inherit; }
.pf-ink-saver.pf-print .pf-cover-inner { border-top-width: 1mm; }
`;

const cssString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ').replace(/[<>]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;

export interface RunningText { title: string; author?: string; org?: string; date?: string }
/** Label lanjutan (string literal, !important karena CSS dasar Paged.js meng-`unset` ::before pada elemen [data-split-from]). */
export function continuationCss(cont: string): string {
  const c = cssString(cont); const p = cssString(` (${cont})`);
  return `.pf-print .pf-doc pre[data-split-from][data-lang]::before{content:attr(data-lang) " · " ${c} !important;}
.pf-print .pf-doc pre[data-split-from]:not([data-lang])::before{content:${c} !important;display:block;font-family:var(--pf-sans);font-size:8.5pt;color:var(--pf-ink-soft);margin-bottom:.3em;}
.pf-print .pf-doc .pf-stack-cell[data-label][data-split-from]::before{content:attr(data-label) ${p} !important;}
.pf-print .pf-t-CON-01 .pf-msg[data-speaker][data-split-from]::before{content:attr(data-speaker) ${p} !important;}`;
}

/** Ubah teks header/footer bertoken ({title} {chapter} {author} {org} {date}) menjadi nilai `content` CSS. */
export function runningContent(spec: string, ctx: RunningText): string {
  if (!spec || !spec.trim()) return 'none';
  const parts: string[] = [];
  const re = /\{(title|chapter|author|org|date)\}/g;
  let last = 0; let m: RegExpExecArray | null;
  const lit = (s: string) => { if (s) parts.push(cssString(s)); };
  while ((m = re.exec(spec))) {
    lit(spec.slice(last, m.index)); last = m.index + m[0].length;
    if (m[1] === 'chapter') parts.push('string(pf-chapter)');
    else lit((m[1] === 'title' ? ctx.title : m[1] === 'author' ? ctx.author : m[1] === 'org' ? ctx.org : ctx.date) ?? '');
  }
  lit(spec.slice(last));
  return parts.length ? parts.join(' ') : 'none';
}

export interface CssVarInput { settings: Settings; brandKit?: BrandKit; mode: 'screen' | 'print'; uiLabels: { cont: string } }
/** Variabel CSS per dokumen (token templat + pengaturan + brand kit). */
export function variablesCss({ settings, brandKit, mode, uiLabels }: CssVarInput): string {
  const t = getTemplate(settings.template).tokens;
  const st = resolveStyle(settings, brandKit);
  const { w, h } = pageSizeMm(settings.paper, settings.orientation);
  const m = settings.margins;
  const vars = [
    `--pf-size:${settings.baseSizePt}pt`, `--pf-leading:${settings.lineHeight}`,
    `--pf-accent:${st.accent}`, `--pf-accent-base:${st.accent}`, `--pf-ink:${st.ink}`,
    `--pf-body-font:var(--pf-${st.bodyFont === 'inter' ? 'sans' : 'serif'})`,
    `--pf-heading-font:var(--pf-${st.headingFont === 'inter' ? 'sans' : 'serif'})`,
    `--pf-heading-weight:${t.headingWeight}`, `--pf-strong-weight:${t.strongWeight}`, `--pf-code-size:${t.codeSizePt}pt`,
    `--pf-l-cont:${cssString(uiLabels.cont)}`, `--pf-l-cont-paren:${cssString(`(${uiLabels.cont})`)}`,
  ];
  if (mode === 'print') vars.push(
    `--pf-page-w:${w}mm`, `--pf-page-h:${h}mm`, `--pf-m-top:${m.top}mm`, `--pf-m-right:${m.right}mm`, `--pf-m-bottom:${m.bottom}mm`, `--pf-m-left:${m.left}mm`,
    `--pf-content-w:${+(w - m.left - m.right).toFixed(2)}mm`, `--pf-content-h:${+(h - m.top - m.bottom).toFixed(2)}mm`,
  );
  return `:root{${vars.join(';')}}`;
}

/**
 * Aturan @page (mm). Penomoran: lihat --pf-pnum (diisi dari peta halaman, bukan counter CSS Paged.js).
 */
export function pageCss(settings: Settings, brandKit: BrandKit | undefined): string {
  const { w, h } = pageSizeMm(settings.paper, settings.orientation);
  const m = settings.margins;
  const st = resolveStyle(settings, brandKit);
  const ctx: RunningText = { title: settings.title, author: settings.author, org: st.orgName, date: settings.dateText };
  const header = runningContent(settings.header, ctx);
  const footerSpec = settings.footer && settings.footer.trim() ? settings.footer : (st.footerText ?? '');
  const footer = runningContent(footerSpec, ctx);
  // Nomor halaman: string per halaman (--pf-pnum) yang ditulis paginator dari peta halaman aktual;
  // sampul tidak bernomor dan nomor awal dapat diatur (PDF-09). Kotak margin bertinggi tetap, jadi tidak mengubah layout.
  const num = settings.pageNumbers ? 'var(--pf-pnum)' : 'none';
  const edt = settings.template === 'EDT-01';
  // EDT-01: nomor di tengah bawah, header di tengah; lainnya: header kiri, footer kiri, nomor kanan.
  const boxes = edt
    ? `@top-center{content:${header};}@bottom-center{content:${num};}@bottom-left{content:${footer};}`
    : `@top-left{content:${header};}@top-right{content:${st.orgName && !/\{org\}/.test(settings.header) ? cssString(st.orgName) : 'none'};}@bottom-left{content:${footer};}@bottom-right{content:${num};}`;
  const none = `@top-left{content:none;}@top-center{content:none;}@top-right{content:none;}@bottom-left{content:none;}@bottom-center{content:none;}@bottom-right{content:none;}`;
  return `@page{size:${w}mm ${h}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;${boxes}}
@page:first{@top-left{content:none;}@top-center{content:none;}@top-right{content:none;}}
@page pf-cover{margin:0;${none}}
.pf-doc h1{string-set:pf-chapter content(text);}
.pf-toc{break-after:page;}
.pf-doc .pf-keep-off{break-after:auto;}
.pf-doc .pf-stack-row,.pf-doc .pf-stack-cell{break-inside:auto;}
.pf-ch-break{break-before:page;}
${settings.template === 'EDT-01' ? '.footnotes{break-before:page;}' : ''}
`;
}

export function templateCss(id: TemplateId): string { return TEMPLATE_CSS[id]; }

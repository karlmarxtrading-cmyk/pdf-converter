import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Dua entri: aplikasi (index.html) dan halaman paginasi (print.html). Tanpa CDN; semua aset dibundel ke dist/.
// Situs statis murni: tidak ada endpoint atau Functions. Satu Web Worker modul (MESIN-36) dibundel dari src/engine/engine.worker.ts.
// The TeX renderer registers commands in KaTeX's own module state. Importing it
// for side effects alone cannot affect the rest of the document engine.
const treeshake = {
  moduleSideEffects: (id: string) => !id.endsWith('/core/tex-renderer.ts') && !id.endsWith('/node_modules/katex/dist/katex.mjs'),
};
export default defineConfig({
  build: {
    outDir: process.env.PF_OUT_DIR || 'dist', emptyOutDir: true, target: 'es2022', sourcemap: process.env.PF_SOURCEMAP === '1',
    rollupOptions: { treeshake, input: { main: resolve(__dirname, 'index.html'), print: resolve(__dirname, 'print.html'), diagram: resolve(__dirname, 'src/render/mermaid-frame.html') } },
    chunkSizeWarningLimit: 2600,
    // Font tidak diinline sebagai data: — pemuat font memakai fetch(), dan CSP produksi (connect-src 'self') menolak fetch data:.
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
  // Varian 'browser' paket ini memakai document.createElement → tidak tersedia di Worker. Satu varian (tabel entitas)
  // dipakai di semua thread agar hasil dekode entitas identik antara Worker dan fallback thread utama.
  resolve: { alias: [{ find: /^decode-named-character-reference$/, replacement: resolve(__dirname, 'node_modules/decode-named-character-reference/index.js') }] },
  worker: { format: 'es', rollupOptions: { treeshake } },
  server: { fs: { allow: ['.'] } },
  test: undefined as never,
});

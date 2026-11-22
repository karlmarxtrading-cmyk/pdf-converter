# Penerimaan rilis RC6

Keputusan aktif berada di [laporan rilis](RELEASE_REPORT.md). Status `VERIFIED` selalu menyebut jenis bukti; perbaikan source bukan bukti browser/PDF/deploy.

| Kebutuhan | Kriteria | Bukti |
|---|---|---|
| Input unggahan | Seluruh 231 rumus ditemukan; sumber asli identik byte | Fixture RC6, oracle independen, tes RC6-M dan RC6-AUD |
| Pemulihan terlacak | 17 isi rumus yang dipulihkan dilaporkan; sumber tidak ditimpa | `MATH_COPY_RECOVERED`, atribut provenance, tes ekspor |
| Konten campuran | Tabel, prosa, kode, URL dan mata uang terjaga | RC6-CLIP, RC6-RENDER, regresi baseline |
| Keutuhan | Mutasi operator rumus ditolak, termasuk raw table | Tes independen dan runner oracle |
| Keamanan | Sanitasi, trust KaTeX false dan batas parsing tetap berlaku | Suite source; bukan pentest penuh |
| HTML mandiri | 231 rumus, font nyata, tanpa skrip/aset jaringan | Contoh aktual dan manifest RC6 |
| Build dan ZIP | Checksum lengkap, build produksi, HTTP dan reproduksi byte | Manifest produksi, laporan HTTP, verifikator arsip |
| Browser/PDF | Periksa render, paginasi, clipboard native dan PDF pada browser sasaran | NOT_RUN dalam lingkungan audit RC6 |
| Situs aktif | Versi/commit dan isi dist sesuai RC6 | NOT_RUN; paket tidak dideploy dalam audit ini |

Matriks dan hasil RC4/RC5 di `docs/history/` serta `evidence/rc5/` dipertahankan untuk penelusuran; statusnya tidak diwariskan ke RC6.

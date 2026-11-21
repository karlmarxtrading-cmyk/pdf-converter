/** Contoh bawaan (isi sintetis, bukan testimoni atau data pelanggan). */
export const SAMPLE_MD = `# Laporan Uji Tarik Baja Tulangan

## Ringkasan Eksekutif

Pengujian terhadap lima sampel baja tulangan **BjTS 420** menunjukkan seluruh sampel memenuhi tegangan leleh minimum. Rata-rata tegangan tarik **166,2 MPa** pada beban kerja, dengan deviasi −1,4% terhadap target.

## Metode

Tegangan dihitung dengan $\\sigma = \\dfrac{F}{A}$, dengan $A = \\tfrac{\\pi}{4} d^2$. Biaya pengujian Rp 1.250.000 per sampel (bukan rumus: $100 tetap literal).

$$
\\bar{\\sigma} = \\frac{1}{n}\\sum_{i=1}^{n} \\sigma_i
$$

## Hasil

| Sampel | Gaya (kN) | Tegangan (MPa) | Selisih |
|---|---:|---:|---:|
| B-01 | 12,5 | 159,2 | −4,2% |
| B-02 | 13,1 | 166,8 | +0,4% |
| B-03 | 13,4 | 170,6 | +2,6% |

> **Catatan:** angka disalin dari lembar uji tanpa pembulatan ulang.[^1]

\`\`\`python
def tegangan(F, d):
    from math import pi
    return F / (pi / 4 * d**2)
\`\`\`

[^1]: Lembar uji laboratorium internal, revisi 2.
`;

export const SAMPLE_CONVERSATION = `User: Jelaskan beda tegangan leleh dan tegangan tarik.

Assistant: **Tegangan leleh** adalah batas ketika material mulai berdeformasi plastis. **Tegangan tarik** adalah tegangan maksimum sebelum putus.

User: Beri contoh angka.

Assistant: Untuk BjTS 420, tegangan leleh minimum 420 MPa; tegangan tarik minimum 525 MPa.

\`\`\`text
User: label ini ada di dalam kode dan bukan pesan baru
\`\`\`
`;

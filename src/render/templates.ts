/**
 * Registri empat format rilis (PF-023…028) — token persis dari katalog 07 §4.
 * Mengganti gaya tidak pernah mengubah isi; perpindahan templat menghormati followTemplateDefaults (UX-06).
 */
import type { BrandKit, Margins, Orientation, Paper, Settings, TemplateId } from '../core/contracts';

export const TEMPLATE_VERSION = '2.0.0';

export type FontKey = 'inter' | 'source-serif-4';

export interface TemplateCapabilities {
  /** blok konsep/contoh/latihan dari penandaan pengguna */ callouts: boolean;
  /** kartu metrik dari daftar yang ditandai pengguna */ metricCards: boolean;
  /** bagian ringkasan yang ditandai pengguna ditata sebagai panel pembuka */ summaryPanel: boolean;
  chapterOpeners: boolean;
  /** catatan ditata sebagai catatan akhir pada halaman baru */ endnotes: boolean;
  /** gutter pembicara + label lanjutan */ speakerGutter: boolean;
  /** running header mengikuti judul bab */ runningChapterHeader: boolean;
  /** kemampuan tahap berikutnya — TIDAK tersedia pada rilis ini (04 §4) */
  twoColumn: false; sectionLandscape: false; marginNotes: false; pageFootnotes: false;
}

export interface TemplateTokens {
  paper: Paper; orientation: Orientation; margins: Margins;
  /** lebar area teks (mm) pada kertas bawaan */ textWidthMm: number;
  bodyFont: FontKey; headingFont: FontKey; baseSizePt: number; lineHeight: number;
  codeSizePt: number; accent: string; ink: string;
  /** bobot huruf yang dipakai templat */ headingWeight: 600 | 700; strongWeight: 600 | 700;
  /** hanya CON-01: gutter pembicara (mm) */ speakerGutterMm?: number; speakerGapMm?: number;
}

export interface TemplateDef {
  id: TemplateId; version: string;
  name: { id: string; en: string }; family: { id: string; en: string };
  summary: { id: string; en: string };
  /** gaya 1.0.0 yang dipetakan ke format ini (RELEASE_SCOPE §3) */ legacyStyle: string;
  capabilities: TemplateCapabilities; tokens: TemplateTokens;
  defaults: Pick<Settings, 'cover' | 'toc' | 'tocDepth' | 'chapterBreak' | 'pageNumbers' | 'pageNumberStart' | 'header' | 'footer'>;
}

const NO_NEXT = { twoColumn: false, sectionLandscape: false, marginNotes: false, pageFootnotes: false } as const;

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  'EDU-01': {
    id: 'EDU-01', version: TEMPLATE_VERSION, legacyStyle: 'textbook',
    name: { id: 'Modul Belajar', en: 'Learning Module' }, family: { id: 'Pendidikan', en: 'Education' },
    summary: { id: 'Alur belajar satu kolom; blok konsep/contoh/latihan hanya dari penandaan Anda.', en: 'Single-column learning flow; concept/example/exercise blocks only from your own markup.' },
    capabilities: { callouts: true, metricCards: false, summaryPanel: false, chapterOpeners: false, endnotes: false, speakerGutter: false, runningChapterHeader: false, ...NO_NEXT },
    tokens: { paper: 'A4', orientation: 'portrait', margins: { top: 20, right: 18, bottom: 20, left: 20 }, textWidthMm: 172, bodyFont: 'source-serif-4', headingFont: 'inter', baseSizePt: 11.5, lineHeight: 1.5, codeSizePt: 9.5, accent: '#275E73', ink: '#182C34', headingWeight: 700, strongWeight: 700 },
    defaults: { cover: false, toc: true, tocDepth: 2, chapterBreak: false, pageNumbers: true, pageNumberStart: 1, header: '{title}', footer: '' },
  },
  'BUS-01': {
    id: 'BUS-01', version: TEMPLATE_VERSION, legacyStyle: 'report',
    name: { id: 'Laporan Eksekutif', en: 'Executive Report' }, family: { id: 'Bisnis', en: 'Business' },
    summary: { id: 'Ringkasan di depan, temuan berjenjang, tabel bukti selebar halaman; kartu metrik hanya dari data Anda.', en: 'Summary up front, tiered findings, full-width evidence tables; metric cards only from your data.' },
    capabilities: { callouts: false, metricCards: true, summaryPanel: true, chapterOpeners: false, endnotes: false, speakerGutter: false, runningChapterHeader: false, ...NO_NEXT },
    tokens: { paper: 'A4', orientation: 'portrait', margins: { top: 18, right: 18, bottom: 18, left: 18 }, textWidthMm: 174, bodyFont: 'inter', headingFont: 'inter', baseSizePt: 10.5, lineHeight: 1.5, codeSizePt: 9.5, accent: '#245B75', ink: '#16242C', headingWeight: 700, strongWeight: 600 },
    defaults: { cover: true, toc: true, tocDepth: 2, chapterBreak: false, pageNumbers: true, pageNumberStart: 1, header: '{title}', footer: '' },
  },
  'EDT-01': {
    id: 'EDT-01', version: TEMPLATE_VERSION, legacyStyle: 'essay',
    name: { id: 'Esai dan Bab Panjang', en: 'Essay and Long Chapter' }, family: { id: 'Editorial', en: 'Editorial' },
    summary: { id: 'Halaman A5 bertipografi buku: pembuka bab, kutipan, catatan akhir, running header sederhana.', en: 'A5 book typography: chapter openers, quotations, endnotes, simple running header.' },
    capabilities: { callouts: false, metricCards: false, summaryPanel: false, chapterOpeners: true, endnotes: true, speakerGutter: false, runningChapterHeader: true, ...NO_NEXT },
    tokens: { paper: 'A5', orientation: 'portrait', margins: { top: 18, right: 16, bottom: 18, left: 16 }, textWidthMm: 116, bodyFont: 'source-serif-4', headingFont: 'source-serif-4', baseSizePt: 10.5, lineHeight: 1.6, codeSizePt: 9.5, accent: '#6B4F3A', ink: '#1A1714', headingWeight: 600, strongWeight: 700 },
    defaults: { cover: false, toc: false, tocDepth: 1, chapterBreak: true, pageNumbers: true, pageNumberStart: 1, header: '{chapter}', footer: '' },
  },
  'CON-01': {
    id: 'CON-01', version: TEMPLATE_VERSION, legacyStyle: '', // tidak ada padanan 1.0.0; Academic Paper → EDT-01 (lihat core/projects.ts)
    name: { id: 'Transkrip Percakapan AI', en: 'AI Conversation Transcript' }, family: { id: 'Percakapan dan Teknis', en: 'Conversation and Technical' },
    summary: { id: 'Dokumen berbasis pesan: label pembicara selalu tertulis, urutan dan isi pesan utuh.', en: 'Message-based document: speaker label always written, message order and content intact.' },
    capabilities: { callouts: false, metricCards: false, summaryPanel: false, chapterOpeners: false, endnotes: false, speakerGutter: true, runningChapterHeader: false, ...NO_NEXT },
    tokens: { paper: 'A4', orientation: 'portrait', margins: { top: 18, right: 18, bottom: 18, left: 18 }, textWidthMm: 174, bodyFont: 'inter', headingFont: 'inter', baseSizePt: 10.5, lineHeight: 1.5, codeSizePt: 9.5, accent: '#526278', ink: '#1B2028', headingWeight: 600, strongWeight: 600, speakerGutterMm: 24, speakerGapMm: 6 },
    defaults: { cover: false, toc: false, tocDepth: 2, chapterBreak: false, pageNumbers: true, pageNumberStart: 1, header: '{title}', footer: '' },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const getTemplate = (id: TemplateId): TemplateDef => {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`Templat tidak dikenal: ${String(id)}`);
  return t;
};
export const listTemplates = (): TemplateDef[] => TEMPLATE_IDS.map((id) => TEMPLATES[id]);

/** Ukuran kertas (mm, portrait). */
export const PAPER_MM: Record<Paper, { w: number; h: number }> = {
  A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, Letter: { w: 215.9, h: 279.4 }, Legal: { w: 215.9, h: 355.6 },
};
export function pageSizeMm(paper: Paper, orientation: Orientation): { w: number; h: number } {
  const p = PAPER_MM[paper];
  return orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** Pengaturan bawaan penuh sebuah templat. */
export function templateDefaultSettings(id: TemplateId, base?: Partial<Settings>): Settings {
  const t = getTemplate(id);
  return {
    template: id, paper: t.tokens.paper, orientation: t.tokens.orientation, margins: { ...t.tokens.margins },
    followTemplateDefaults: true, bodyFont: t.tokens.bodyFont, baseSizePt: t.tokens.baseSizePt, lineHeight: t.tokens.lineHeight,
    ...t.defaults,
    inkSaver: false, contentLang: 'id', title: '', allowExternalImages: false,
    ...base,
  };
}

/** Kelompok pengaturan untuk "reset per kelompok" dan indikator kustom (UX-06). */
export const SETTING_GROUPS = {
  paper: ['paper', 'orientation', 'margins'],
  typography: ['bodyFont', 'baseSizePt', 'lineHeight'],
  structure: ['cover', 'toc', 'tocDepth', 'chapterBreak'],
  running: ['pageNumbers', 'pageNumberStart', 'header', 'footer'],
} as const satisfies Record<string, readonly (keyof Settings)[]>;
export type SettingGroup = keyof typeof SETTING_GROUPS;
type TemplateKey = (typeof SETTING_GROUPS)[SettingGroup][number];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Kunci yang berbeda dari rekomendasi templat aktif. */
export function customizedKeys(settings: Settings): TemplateKey[] {
  const d = templateDefaultSettings(settings.template) as unknown as Record<string, unknown>;
  const s = settings as unknown as Record<string, unknown>;
  return (Object.values(SETTING_GROUPS).flat() as TemplateKey[]).filter((k) => !same(s[k], d[k]));
}

export interface ApplyTemplateResult {
  settings: Settings;
  /** kunci yang diubah mengikuti templat baru */ applied: TemplateKey[];
  /** kunci kustom yang SENGAJA dipertahankan (hanya saat followTemplateDefaults=false) */ kept: TemplateKey[];
}

/**
 * Ganti templat.
 * - followTemplateDefaults=true  → "Gunakan rekomendasi templat": preset penuh (kertas, margin, tipografi, sampul, TOC, header).
 * - followTemplateDefaults=false → "Terapkan gaya": hanya id templat yang berganti; kertas/margin/tipografi/sampul/TOC/header
 *   milik pengguna TIDAK disentuh dan dilaporkan pada `kept` agar UI dapat menjelaskannya.
 * Judul, penulis, bahasa isi, hemat tinta, brand kit, dan izin gambar eksternal tidak pernah diubah.
 */
export function applyTemplate(current: Settings, next: TemplateId): ApplyTemplateResult {
  const d = templateDefaultSettings(next) as unknown as Record<string, unknown>;
  const cur = current as unknown as Record<string, unknown>;
  const keys = Object.values(SETTING_GROUPS).flat() as TemplateKey[];
  const out: Record<string, unknown> = { ...cur, template: next };
  const applied: TemplateKey[] = []; const kept: TemplateKey[] = [];
  for (const k of keys) {
    if (current.followTemplateDefaults) {
      if (!same(cur[k], d[k])) applied.push(k);
      out[k] = typeof d[k] === 'object' && d[k] ? { ...(d[k] as object) } : d[k];
    } else if (!same(cur[k], d[k])) kept.push(k);
  }
  return { settings: out as unknown as Settings, applied, kept };
}

/** Kembalikan satu kelompok ke rekomendasi templat aktif (tindakan eksplisit pengguna). */
export function resetGroup(current: Settings, group: SettingGroup): Settings {
  const d = templateDefaultSettings(current.template) as unknown as Record<string, unknown>;
  const out = { ...(current as unknown as Record<string, unknown>) };
  for (const k of SETTING_GROUPS[group]) out[k] = typeof d[k] === 'object' && d[k] ? { ...(d[k] as object) } : d[k];
  return out as unknown as Settings;
}

/** Batas keterbacaan (katalog §2): di bawah ini pengguna diberi peringatan, bukan dikecilkan diam-diam. */
export const READABILITY = { minBodyPt: 9.5, minSmallPt: 8.5, minMathScale: 0.7, minMarginMm: 8 } as const;

export interface ResolvedStyle {
  accent: string; ink: string; bodyFont: FontKey; headingFont: FontKey;
  orgName?: string; footerText?: string; logoAssetId?: string; brandName?: string;
}
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Gabungan token templat + brand kit (aksen, font judul, logo, organisasi, footer) — sama di keempat format. */
export function resolveStyle(settings: Settings, brandKit?: BrandKit): ResolvedStyle {
  const t = getTemplate(settings.template).tokens;
  const accent = brandKit && HEX.test(brandKit.accent) ? brandKit.accent : t.accent;
  return {
    accent, ink: t.ink, bodyFont: settings.bodyFont ?? t.bodyFont,
    headingFont: brandKit?.headingFont ?? t.headingFont,
    orgName: brandKit?.orgName || undefined, footerText: brandKit?.footerText || undefined,
    logoAssetId: brandKit?.logoAssetId, brandName: brandKit?.name,
  };
}

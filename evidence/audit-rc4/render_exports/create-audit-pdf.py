#!/usr/bin/env python3
"""Create the human audit report, not a PDF produced by the PaperForma engine.

Reads the integrator's final Markdown and release-summary JSON. No application code
is executed and no test result is inferred. Usage is documented in --help.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from functools import partial
from pathlib import Path

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, HRFlowable, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle, XPreformatted,
)


INK = colors.HexColor('#18303e')
TEAL = colors.HexColor('#245b75')
MUTED = colors.HexColor('#596b79')
RULE = colors.HexColor('#d7e0e7')
PALE = colors.HexColor('#edf3f6')
AMBER = colors.HexColor('#fff2d8')
AMBER_INK = colors.HexColor('#6e4a09')
PAGE_W, PAGE_H = A4
LEFT = RIGHT = 19 * mm
TOP, BOTTOM = 20 * mm, 18 * mm
WIDTH = PAGE_W - LEFT - RIGHT


def register_fonts() -> None:
    base = Path('/usr/share/fonts/truetype/dejavu')
    for name, filename in [
        ('AuditSans', 'DejaVuSans.ttf'),
        ('AuditSansBold', 'DejaVuSans-Bold.ttf'),
        ('AuditSansItalic', 'DejaVuSans-Oblique.ttf'),
        ('AuditSansBoldItalic', 'DejaVuSans-BoldOblique.ttf'),
        ('AuditMono', 'DejaVuSansMono.ttf'),
    ]:
        pdfmetrics.registerFont(TTFont(name, str(base / filename)))
    pdfmetrics.registerFontFamily(
        'AuditSans', normal='AuditSans', bold='AuditSansBold',
        italic='AuditSansItalic', boldItalic='AuditSansBoldItalic',
    )


def styles() -> dict[str, ParagraphStyle]:
    body = ParagraphStyle(
        'AuditBody', fontName='AuditSans', fontSize=9.3, leading=13.5,
        textColor=INK, spaceAfter=7, allowWidows=0, allowOrphans=0,
    )
    return {
        'body': body,
        'small': ParagraphStyle('AuditSmall', parent=body, fontSize=8.0, leading=11.4, textColor=MUTED),
        'caption': ParagraphStyle('AuditCaption', parent=body, fontSize=8.2, leading=11.4, textColor=MUTED, spaceAfter=8),
        'h1': ParagraphStyle('AuditH1', parent=body, fontName='AuditSansBold', fontSize=23, leading=28, spaceBefore=4, spaceAfter=14, keepWithNext=True),
        'h2': ParagraphStyle('AuditH2', parent=body, fontName='AuditSansBold', fontSize=15, leading=20, textColor=TEAL, spaceBefore=14, spaceAfter=8, keepWithNext=True),
        'h3': ParagraphStyle('AuditH3', parent=body, fontName='AuditSansBold', fontSize=10.5, leading=14, spaceBefore=9, spaceAfter=5, keepWithNext=True),
        'table': ParagraphStyle('AuditTable', parent=body, fontSize=8.2, leading=11.5, spaceAfter=0, wordWrap='CJK'),
        'table_head': ParagraphStyle('AuditTableHead', parent=body, fontName='AuditSansBold', fontSize=8.2, leading=11.5, textColor=colors.white, spaceAfter=0, wordWrap='CJK'),
        'code': ParagraphStyle('AuditCode', parent=body, fontName='AuditMono', fontSize=7.4, leading=10.7, leftIndent=7, rightIndent=7, backColor=PALE, borderPadding=7, spaceBefore=4, spaceAfter=9),
        'bullet': ParagraphStyle('AuditBullet', parent=body, leftIndent=11, firstLineIndent=-9, bulletIndent=0, spaceAfter=5),
    }


def inline(text: str) -> str:
    """Convert the small, trusted Markdown subset used by the integrator."""
    text = html.escape(text, quote=False)
    text = re.sub(r'`([^`]+)`', lambda m: '<font name="AuditMono" size="8">' + m.group(1) + '</font>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', text)
    # Make source file references readable in print; links remain text, not file actions.
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 (\2)', text)
    return text


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(inline(text), style)


def make_table(rows: list[list[str]], st: dict, widths: list[float] | None = None) -> Table:
    count = max(len(row) for row in rows)
    rows = [row + [''] * (count - len(row)) for row in rows]
    if widths is None:
        if count == 2:
            widths = [WIDTH * 0.31, WIDTH * 0.69]
        elif count == 3:
            widths = [WIDTH * 0.26, WIDTH * 0.29, WIDTH * 0.45]
        elif count == 4:
            widths = [WIDTH * 0.20, WIDTH * 0.20, WIDTH * 0.22, WIDTH * 0.38]
        else:
            widths = [WIDTH / count] * count
    cells = [[paragraph(value, st['table_head' if i == 0 else 'table']) for value in row] for i, row in enumerate(rows)]
    table = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'AuditSans'),
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, TEAL),
        ('LINEBELOW', (0, 1), (-1, -1), 0.35, RULE),
    ]))
    return table


def note(text: str, st: dict, caution: bool = False) -> Table:
    style = ParagraphStyle('NoteText', parent=st['body'], spaceAfter=0, textColor=AMBER_INK if caution else INK)
    table = Table([[paragraph(text, style)]], colWidths=[WIDTH])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'AuditSans'),
        ('BACKGROUND', (0, 0), (-1, -1), AMBER if caution else PALE),
        ('BOX', (0, 0), (-1, -1), 0.5, RULE),
        ('LEFTPADDING', (0, 0), (-1, -1), 11), ('RIGHTPADDING', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return table


def markdown_flow(text: str, st: dict) -> list:
    lines = text.splitlines()
    story: list = []
    pos = 0
    while pos < len(lines):
        line = lines[pos].rstrip()
        if not line.strip():
            pos += 1
            continue
        if line.startswith('```'):
            pos += 1
            code: list[str] = []
            while pos < len(lines) and not lines[pos].startswith('```'):
                code.append(lines[pos]); pos += 1
            longest = max(map(len, code), default=1)
            size = min(st['code'].fontSize, (WIDTH - 30) / (max(longest, 1) * 0.61))
            code_style = ParagraphStyle('CodeFit', parent=st['code'], fontSize=max(5.7, size), leading=max(8.2, size * 1.4))
            story.append(XPreformatted(html.escape('\n'.join(code)), code_style))
            pos += 1
            continue
        if line.lstrip().startswith('|'):
            rows: list[list[str]] = []
            while pos < len(lines) and lines[pos].lstrip().startswith('|'):
                row = [x.strip().replace('\\|', '|') for x in re.split(r'(?<!\\)\|', lines[pos].strip().strip('|'))]
                if not all(re.fullmatch(r':?-{3,}:?', cell or '') for cell in row):
                    rows.append(row)
                pos += 1
            if rows:
                story.extend([make_table(rows, st), Spacer(1, 8)])
            continue
        heading = re.match(r'^(#{1,6})\s+(.+)', line)
        if heading:
            level, title = len(heading.group(1)), heading.group(2)
            story.append(paragraph(title, st['h1' if level == 1 else 'h2' if level == 2 else 'h3']))
            pos += 1
            continue
        if re.fullmatch(r'\s*[-*_]{3,}\s*', line):
            story.extend([Spacer(1, 3), HRFlowable(width='100%', thickness=0.6, color=RULE), Spacer(1, 7)])
            pos += 1
            continue
        bullet = re.match(r'^\s*(?:[-*]|(\d+)\.)\s+(.+)', line)
        if bullet:
            prefix = bullet.group(1) + '.' if bullet.group(1) else '•'
            story.append(paragraph(prefix + ' ' + bullet.group(2), st['bullet']))
            pos += 1
            continue
        content = [line]
        pos += 1
        while pos < len(lines) and lines[pos].strip() and not re.match(r'^(?:#{1,6}\s|```|\s*\||\s*[-*]\s|\s*\d+\.\s)', lines[pos]):
            content.append(lines[pos].strip()); pos += 1
        story.append(paragraph(' '.join(content), st['body']))
    return story


class AuditDoc(BaseDocTemplate):
    def __init__(self, output: Path, *, subtitle: str = 'Audit source, integritas isi, dan bukti pengujian'):
        super().__init__(
            str(output), pagesize=A4, leftMargin=LEFT, rightMargin=RIGHT,
            topMargin=TOP, bottomMargin=BOTTOM, title='PaperForma RC4 — Laporan Audit Teknis',
            author='Audit teknis PaperForma dengan ChatGPT Work', subject=subtitle,
            pageCompression=1, invariant=1,
        )
        frame = Frame(LEFT, BOTTOM, WIDTH, PAGE_H - TOP - BOTTOM, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='Audit', frames=[frame], onPage=self.decorate))

    @staticmethod
    def decorate(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(TEAL)
        canvas.rect(0, PAGE_H - 4 * mm, PAGE_W, 4 * mm, fill=1, stroke=0)
        canvas.setFont('AuditSansBold', 8)
        canvas.setFillColor(TEAL)
        canvas.drawString(LEFT, PAGE_H - 12 * mm, 'PAPERFORMA  /  AUDIT RC4')
        canvas.setFont('AuditSans', 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - RIGHT, PAGE_H - 12 * mm, '21 November 2026')
        canvas.setStrokeColor(RULE)
        canvas.line(LEFT, 13 * mm, PAGE_W - RIGHT, 13 * mm)
        canvas.setFont('AuditSans', 7)
        canvas.drawString(LEFT, 8.5 * mm, 'Laporan audit · bukan PDF yang dihasilkan mesin PaperForma')
        canvas.drawRightString(PAGE_W - RIGHT, 8.5 * mm, str(doc.page))
        canvas.restoreState()

    def afterFlowable(self, flowable) -> None:
        if isinstance(flowable, Paragraph) and flowable.style.name in ('CoverTitle', 'AuditH1', 'AuditH2'):
            label = flowable.getPlainText()
            key = 'heading-' + str(self.page) + '-' + hashlib.sha256(label.encode()).hexdigest()[:12]
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(label, key, level=1 if flowable.style.name == 'AuditH2' else 0, closed=False)


def scaled_image(path: Path, width: float, max_height: float) -> Image:
    with PillowImage.open(path) as source:
        iw, ih = source.size
    scale = min(width / iw, max_height / ih)
    return Image(str(path), width=iw * scale, height=ih * scale, hAlign='CENTER')


def cover(summary: dict, st: dict) -> list:
    title_style = ParagraphStyle('CoverTitle', parent=st['h1'], fontSize=32, leading=38, spaceAfter=16)
    sub_style = ParagraphStyle('CoverSub', parent=st['body'], fontSize=14, leading=20, textColor=MUTED, spaceAfter=18)
    stat_style = ParagraphStyle('CoverStat', parent=st['h2'], fontSize=21, leading=26, spaceBefore=0, spaceAfter=4)
    tests = summary['tests']
    archive = summary['input_archive']
    values = [
        [str(archive['files']), 'berkas arsip input tercakup dalam inventaris audit'],
        [str(tests['vitest']) + ' / ' + str(tests['node']), 'tes Vitest / tes Node pada kandidat final'],
    ]
    cells = [[paragraph(value, stat_style), paragraph(label, st['small'])] for value, label in values]
    cards = Table([[cells[0], cells[1]]], colWidths=[WIDTH / 2, WIDTH / 2])
    cards.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'AuditSans'),
        ('BACKGROUND', (0, 0), (-1, -1), PALE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 13), ('RIGHTPADDING', (0, 0), (-1, -1), 13),
        ('TOPPADDING', (0, 0), (-1, -1), 12), ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LINEAFTER', (0, 0), (0, 0), 1, colors.white),
    ]))
    source_hash = str(archive['sha256'])
    story = [
        Spacer(1, 19 * mm),
        paragraph('LAPORAN TEKNIS · ' + str(summary['version']), st['h3']),
        Paragraph('Audit menyeluruh<br/>PaperForma RC4', title_style),
        Paragraph('Pembacaan tulisan dan rumus,<br/>integritas isi, HTML mandiri, dan cetak PDF.', sub_style),
        note('**Kandidat perbaikan; browser/PDF baru belum terverifikasi.**', st, caution=True),
        Spacer(1, 16), cards, Spacer(1, 18),
        paragraph('Fokus keputusan', st['h2']),
        paragraph('Perbaikan diarahkan pada kegagalan nyata yang dapat direproduksi: rumus yang tetap menjadi teks, celah pemeriksaan keutuhan, pemulihan status, serta kualitas halaman. Hasil otomatis dibedakan dari bukti visual lama dan pengujian yang belum dapat dijalankan.', st['body']),
        paragraph('Cara membaca laporan', st['h2']),
        paragraph('Bagian teknis merangkum source dan hasil pengujian final. Lampiran gambar secara eksplisit memakai arsip RC3. Daftar temuan rinci dan log tetap tersedia dalam paket agar angka serta batas kesimpulan dapat ditelusuri.', st['body']),
        Spacer(1, 9),
        paragraph('SHA-256 arsip input', st['small']),
        XPreformatted(source_hash, st['code']),
        Spacer(1, 8),
        note('Laporan ini dibuat menggunakan ReportLab untuk menyajikan audit. **Laporan ini bukan PDF yang dihasilkan oleh mesin PaperForma** dan tidak dipakai untuk mengklaim bahwa gate cetak aplikasi telah lulus.', st),
        PageBreak(),
    ]
    return story


def historical_appendix(visual_root: Path, st: dict) -> list:
    """One page with observable historical defects, explicitly labelled before fixes."""
    crop_path = visual_root / 'a5-repeated-key-before-crop.png'
    source_path = visual_root / 'mixed-A5-chrome-p10.png'
    with PillowImage.open(source_path) as image:
        image.crop((90, 305, 785, 575)).save(crop_path)
    math_crop = visual_root / 'einstein-historical-math-crop.png'
    with PillowImage.open(visual_root / 'einstein-chrome-p02.png') as image:
        image.crop((95, 235, 1145, 775)).save(math_crop)
    return [
        PageBreak(),
        paragraph('Lampiran visual: arsip RC3', st['h1']),
        note('**Bukti sebelum perbaikan.** Gambar di halaman ini dirender oleh Poppler dari PDF lama yang sudah ada dalam ZIP input. Tidak ada gambar yang dinyatakan sebagai PDF kandidat RC4.', st, caution=True),
        Spacer(1, 11),
        paragraph('Header kolom kunci hampir tidak terbaca', st['h2']),
        scaled_image(crop_path, WIDTH, 185),
        paragraph('Mixed A5 Chrome, halaman fisik 10. Header “Kolom 1” berwarna putih pada latar yang sangat muda. PF-R4-08 memperbaiki selector CSS agar header mempertahankan pasangan warna template; hasil baru telah diperiksa pada DOM/CSS, belum pada PDF browser.', st['caption']),
        paragraph('Notasi matematika sudah dapat dicetak pada fixture lama', st['h2']),
        scaled_image(math_crop, WIDTH, 225),
        paragraph('Einstein A4 Chrome, halaman fisik 2. Pecahan, akar, matriks dan integral tampil sebagai matematika. Keberhasilan fixture ini tidak membuktikan bahwa semua jalur clipboard dan semua dokumen pengguna bekerja. Regresi trigonometri kandidat diuji tersendiri.', st['caption']),
        paragraph('Rujukan: evidence/audit-rc4/render_exports/pdf-visual-history/FINDINGS.md beserta PNG halaman penuh, checksum sumber, dan log render.', st['small']),
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd(), help='Candidate repository root')
    parser.add_argument('--summary', type=Path, required=True, help='Integrator-approved final release-summary JSON')
    parser.add_argument('--markdown', type=Path, help='Defaults to ROOT/docs/AUDIT_RC4.md')
    parser.add_argument('--output', type=Path, help='Defaults to ROOT/docs/AUDIT_RC4.pdf')
    parser.add_argument('--visual-root', type=Path, default=Path(__file__).parent / 'pdf-visual-history')
    args = parser.parse_args()
    markdown_path = args.markdown or args.root / 'docs/AUDIT_RC4.md'
    output = args.output or args.root / 'docs/AUDIT_RC4.pdf'
    if not markdown_path.is_file() or not args.summary.is_file():
        raise SystemExit('Wait for the integrator final Markdown and release-summary JSON. No placeholder counts are permitted.')
    summary = json.loads(args.summary.read_text())
    markdown = markdown_path.read_text()
    register_fonts()
    st = styles()
    # Preserve the complete integrator-authored text, then append explicitly historical evidence.
    story = cover(summary, st) + markdown_flow(markdown, st) + historical_appendix(args.visual_root, st)
    output.parent.mkdir(parents=True, exist_ok=True)
    AuditDoc(output).build(story, canvasmaker=partial(Canvas, initialFontName='AuditSans', initialFontSize=9.3))
    record = {
        'kind': 'ReportLab audit report, not a PaperForma output PDF',
        'sourceMarkdown': str(markdown_path.resolve()),
        'sourceMarkdownSha256': hashlib.sha256(markdown.encode()).hexdigest(),
        'releaseSummary': str(args.summary.resolve()),
        'releaseSummarySha256': hashlib.sha256(args.summary.read_bytes()).hexdigest(),
        'output': str(output.resolve()),
        'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    }
    (Path(__file__).parent / 'audit-report-provenance.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()

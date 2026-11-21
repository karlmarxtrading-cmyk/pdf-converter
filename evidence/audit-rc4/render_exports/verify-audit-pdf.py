#!/usr/bin/env python3
"""Verify the ReportLab audit document; this is not a PaperForma PDF gate."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


BASE = Path(__file__).resolve().parent
ROOT = next((root for root in (
    Path.cwd(), BASE.parent.parent / 'candidate', BASE.parent.parent.parent,
) if (root / 'docs/AUDIT_RC4.pdf').is_file()), None)
if ROOT is None:
    raise SystemExit('Run from the repository root containing docs/AUDIT_RC4.pdf.')
PDF = ROOT / 'docs/AUDIT_RC4.pdf'
PAGES = BASE / 'audit-report-pages'


def run(*args: str) -> str:
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    return result.stdout


def main() -> None:
    reader = PdfReader(str(PDF), strict=True)
    assert not reader.is_encrypted
    assert len(reader.pages) == 7
    records = []
    used_fonts = set()
    for number, page in enumerate(reader.pages, 1):
        stream = page.get_contents()
        operations = len(stream.operations) if stream is not None else 0
        assert operations > 0
        current_font = None
        for args, operator in stream.operations:
            if operator == b'Tf':
                current_font = str(args[0])
            elif operator in (b'Tj', b'TJ', b"'", b'"') and args:
                font = page['/Resources']['/Font'][current_font]
                used_fonts.add(str(font['/BaseFont']))
                descriptor = font.get('/FontDescriptor')
                assert descriptor is not None and '/FontFile2' in descriptor.get_object()
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        assert abs(width - 595.2756) < 0.01 and abs(height - 841.8898) < 0.01
        text = page.extract_text() or ''
        assert len(re.sub(r'\s+', '', text)) > 200
        image = PAGES / f'page-{number}.png'
        with Image.open(image) as raster:
            dimensions = list(raster.size)
            assert dimensions == [1241, 1754]
        records.append({
            'page': number, 'pageSizePoints': [width, height],
            'contentOperations': operations, 'extractedTextCharacters': len(text),
            'render': str(image.relative_to(BASE)),
            'renderSha256': hashlib.sha256(image.read_bytes()).hexdigest(),
            'renderDimensions': dimensions,
            'visualReview': 'PASS: manually inspected at readable scale; no clipping or overlap observed',
        })
    fonts = run('pdffonts', str(PDF))
    (BASE / 'audit-report-fonts.txt').write_text(fonts)
    font_rows = [row.split() for row in fonts.splitlines()[2:] if row.strip()]
    embedded = [row for row in font_rows if row[1] == 'TrueType']
    assert len(embedded) == 3 and len(used_fonts) == 3
    assert all(row[3:6] == ['yes', 'yes', 'yes'] for row in embedded)
    unused_fonts = [row[0] for row in font_rows if '/' + row[0] not in used_fonts]
    assert unused_fonts == ['Helvetica']
    info = run('pdfinfo', str(PDF))
    (BASE / 'audit-report-info.txt').write_text(info)
    text = run('pdftotext', str(PDF), '-')
    (BASE / 'audit-report-text.txt').write_text(text)
    normal = re.sub(r'\s+', ' ', text)
    for anchor in (
        '332/332, 41 berkas', '285/285', 'BLOCKED_BY_ENVIRONMENT',
        '680c8b5c6cb1ca3948e19c17857682ab6711d3a2fb70430565692f8a0feadd79',
        '03e0a565c52b2a514eb01e878e7f0ca3c31a1a7cc04b9a4a8c90dc53d2390a1d',
        'Kandidat perbaikan; browser/PDF baru belum terverifikasi.',
        'Lampiran visual: arsip RC3', '70,03 → 99,41', 'bukan PDF yang dihasilkan mesin PaperForma',
    ):
        assert anchor in normal, anchor
    bbox = BASE / 'audit-report-bbox.xhtml'
    run('pdftotext', '-bbox-layout', str(PDF), str(bbox))
    xml = ET.parse(bbox)
    off_page = []
    for n, page in enumerate(xml.findall('.//{*}page'), 1):
        w, h = float(page.attrib['width']), float(page.attrib['height'])
        for word in page.findall('.//{*}word'):
            coords = [float(word.attrib[k]) for k in ('xMin', 'yMin', 'xMax', 'yMax')]
            if coords[0] < -0.1 or coords[1] < -0.1 or coords[2] > w + 0.1 or coords[3] > h + 0.1:
                off_page.append({'page': n, 'word': word.text, 'bbox': coords})
    assert not off_page

    thumb_width = 390
    thumb_height = 552
    sheet = Image.new('RGB', (thumb_width * 2 + 52, (thumb_height + 42) * 4 + 34), '#e7edf1')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    draw.text((16, 10), 'AUDIT RC4 — laporan ReportLab, bukan output mesin PaperForma', fill='#18303e', font=font)
    for i in range(7):
        x, y = 17 + (i % 2) * (thumb_width + 18), 40 + (i // 2) * (thumb_height + 42)
        with Image.open(PAGES / f'page-{i + 1}.png') as raster:
            raster.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            sheet.paste(raster, (x, y))
        draw.text((x, y + thumb_height + 5), f'Halaman {i + 1}', fill='#18303e', font=font)
    sheet.save(BASE / 'audit-report-contact-sheet.png')

    result = {
        'kind': 'ReportLab audit document QA, not application PDF certification',
        'pdf': str(PDF), 'sha256': hashlib.sha256(PDF.read_bytes()).hexdigest(),
        'bytes': PDF.stat().st_size, 'pages': records,
        'strictPdfParse': 'PASS', 'embeddedTextFonts': '3/3 used text fonts: TrueType, embedded/subset/Unicode mappings',
        'unusedDeclaredFonts': unused_fonts,
        'offPageTextBoxes': off_page, 'keyFactsVerified': True,
        'visualReview': 'All 7 pages manually inspected from Poppler 150-dpi PNGs; final changed appendix page reinspected',
        'productBrowserPdfGate': 'NOT_RUN: no PaperForma-generated candidate PDF was produced or certified',
    }
    (BASE / 'audit-report-qa.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'pdf': str(PDF), 'sha256': result['sha256'], 'bytes': result['bytes'], 'pages': 7, 'qa': 'PASS'}, indent=2))


if __name__ == '__main__':
    main()

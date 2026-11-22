"""Render public matrix and book PDF pages from the active release for visual review.

Run from the repository root after the PDF and book measurements. The index
records actual PDF hashes and exact page numbers. Human inspection is separate.
No private input or book directory is accepted by this tool.
"""
from hashlib import sha256
import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RELEASE = 'rc12'
EXAMPLES = ROOT / 'examples' / RELEASE
EVIDENCE = ROOT / 'evidence' / RELEASE
DEST = EVIDENCE / 'pdf-review' / 'visual-samples'


def collect(pdf, group):
    digest = sha256(pdf.read_bytes()).hexdigest()
    rows = []
    with fitz.open(pdf) as doc:
        pages = {len(doc) - 1}
        if group == 'book' or any(part in pdf.name for part in ('trigonometry-EDT', 'mixed-supported-EDT', 'conversation-EDU-01-A4')):
            pages.update((0, len(doc) // 2))
        if group == 'matrix' and len(pages) > 1 and len(doc) > 1:
            pages.add(1)
        for index in sorted(pages):
            pix = doc[index].get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
            image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            image.thumbnail((680, 500), Image.Resampling.LANCZOS)
            rows.append((image, {
                'group': group, 'pdf': pdf.relative_to(ROOT).as_posix(), 'pdfSha256': digest,
                'page': index + 1, 'pages': len(doc),
                'title': pdf.parent.name if group == 'book' else pdf.stem,
            }))
    return rows


def main():
    start = json.loads((EVIDENCE / 'acceptance' / 'start.json').read_text())
    matrix = sorted((EXAMPLES / 'pdf').glob('*.pdf'))
    books = sorted((EXAMPLES / 'book').glob('*/dokumen.pdf'))
    if not matrix or len(books) != 5:
        raise ValueError('Render samples after completing the public matrix and all five book cases')
    DEST.mkdir(parents=True, exist_ok=True)
    records = []
    for group, cases in (('matrix', matrix), ('book', books)):
        samples = [sample for pdf in cases for sample in collect(pdf, group)]
        for first in range(0, len(samples), 4):
            name = f'{group}-{1 + first // 4:02d}.jpg'
            sheet = Image.new('RGB', (1400, 1080), '#ebeff1')
            draw = ImageDraw.Draw(sheet)
            for offset, (image, row) in enumerate(samples[first:first+4]):
                x = offset % 2 * 700 + 10
                y = offset // 2 * 540 + 30
                draw.text((x, y-23), f"{row['title']} | {row['page']}/{row['pages']}", font=ImageFont.load_default(), fill='black')
                sheet.paste(image, (x, y))
                records.append({**row, 'sheet': name})
            sheet.save(DEST / name, quality=87)
    report = {'runId': start['runId'], 'identity': start['identity'], 'matrixPdfs': len(matrix),
              'bookPdfs': len(books), 'sampledPages': len(records), 'samples': records}
    (DEST / 'index.json').write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    main()

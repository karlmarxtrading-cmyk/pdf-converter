"""Compare mixed physical PDF text with each source file, deriving expectations afresh."""
from pathlib import Path
from hashlib import sha256
import json, re, unicodedata
import fitz

def normalize(value):
    return re.sub(r'[\s\u00ad\u200b]', '', unicodedata.normalize('NFC', value))

def tab_values(row):
    return [cell.strip() for cell in row.strip('|').split('|')]

rows = []
inputs = json.loads(Path('evidence/rc12/pdf/results.json').read_text())['results']
for job in inputs:
    if not job['id'].startswith('mixed-'):
        continue
    source = Path(job['file']).read_text()
    code = re.search(r'^```python\n(.*?)\n```$', source, re.M | re.S)[1].splitlines()
    long_rows = [tab_values(line) for line in source.splitlines() if re.match(r'\| R\d{3} \|', line)]
    wide_cells = [cell for line in source.splitlines() if re.match(r'\| v\d\.1 \|', line) for cell in tab_values(line)]
    paragraph = re.search(r'Bahasa Indonesia[^\n]*(?:\n(?!\n)[^\n]*)*', source)[0]
    with fitz.open(job['pdfPath']) as pdf:
        text = normalize('\n'.join(page.get_text() for page in pdf))
    missing_code = [i+1 for i, value in enumerate(code) if normalize(value) not in text]
    missing_rows = [row[0] for row in long_rows if normalize(''.join(row)) not in text]
    missing_cells = [cell for cell in wide_cells if normalize(cell) not in text]
    strict_refusal = job['status'] == 'UNSUPPORTED_BLOCKED'
    unicode_exact = normalize(paragraph) in text
    close = 'PENUTUP-AKHIR-DOKUMEN' in text
    fingerprint = sha256(Path(job['pdfPath']).read_bytes()).hexdigest()
    rows.append({'id':job['id'], 'pdf':job['pdfPath'], 'sha256':fingerprint,
        'strictRefusal':strict_refusal, 'literalUnicodeParagraphMatches':unicode_exact, 
        'codeLineCount':len(code), 'codeLinesMissing':missing_code, 'longTableRows':len(long_rows),
        'missingLongRows':missing_rows, 'wideTableCellCount':len(wide_cells), 'wideTableCellsMissing':missing_cells,
        'terminalMarkerPresent':close, 'pass':len(code)==112 and len(long_rows)==70 and len(wide_cells)==60
              and not (missing_code or missing_rows or missing_cells) and close and (unicode_exact or strict_refusal)
              and fingerprint==job['pdfSha256']})
report = {'method': 'Independent PyMuPDF extraction, source-derived 112 code line contents, 70 long-table rows, 60 wide-table cells and Unicode paragraph. Removes layout whitespace, soft hyphen and zero-width space only, retaining case, signs, punctuation and ZWJ. Strictly refused private-use preview may corrupt private characters; its diagnostic is reported as such. Indentation and blank lines are checked separately in physical-verification.json.', 'cases': rows}
Path('evidence/rc12/pdf-review/mixed.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print('Mixed case details',[(r['id'], r['pass'], r['literalUnicodeParagraphMatches']) for r in rows])
if not rows or not all(r['pass'] for r in rows):
    raise SystemExit(1)

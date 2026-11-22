"""Locate independent source markers in the actual PDF text, retaining speaker order."""
from pathlib import Path
import re,json,hashlib
import fitz
root=Path('.'); results=[]
for path in sorted((root/'examples/rc12/pdf').glob('conversation-*.pdf')):
    with fitz.open(path) as doc:
        text=' '.join(' '.join(page.get_text().split()) for page in doc)
    # Math layout is inspected separately. These literal markers are deliberately chosen
    # outside formulas; compare the same immutable sequence in every template.
    markers=['Murid.','Mengapa tanda minus tetap muncul pada','Guru.','Bandingkan nilai pada tabel.',
             'Murid.','Saya akan memeriksa dengan kode.','def selisih(x):','# cek baris kosong dan indentasi',
             'return x - 1','Guru.','Selesai.']
    offset=0; positions=[]
    for marker in markers:
        pos=text.find(marker,offset)
        positions.append(pos)
        if pos<0:break
        offset=pos+len(marker)
    results.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                    'markers':markers,'offsets':positions,'pass':len(positions)==len(markers) and min(positions)>=0})
out=root/'evidence/rc12/pdf-review/dialogue.json'
out.write_text(json.dumps({'method':'Exact ordered literal prose/speaker/code markers in the stored PDF, with PDF layout whitespace normalized. Source is a labelled synthetic Markdown dialogue, not an authenticated provider clipboard sample.','cases':results},indent=2)+'\n')
if not results or not all(c['pass'] for c in results):raise SystemExit(1)

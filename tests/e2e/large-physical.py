"""Compare independent GFM, downloaded HTML and selectable physical PDF text.
The browser supplies only locations of source text, never the expected strings.
"""
import hashlib,json,re,subprocess,sys,unicodedata
from collections import defaultdict
from pathlib import Path
from lxml import html
import fitz

source,standalone,pdf,geometry=map(Path,sys.argv[1:5])
raw=source.read_text(encoding='utf-8-sig')
def normalize(s):
    return re.sub(r'\s+','',unicodedata.normalize('NFC',s))
def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()
def check(want,got):
    idx=next((i for i,(a,b) in enumerate(zip(want,got)) if a!=b),min(len(want),len(got)))
    return dict(match=want==got,expectedLength=len(want),actualLength=len(got),matchedPrefix=idx,
                expectedSha256=digest(want),actualSha256=digest(got),last120=want[-120:]==got[-120:])
independent=subprocess.check_output(['pandoc','--from=gfm','--to=html5','--wrap=none',str(source)])
ref=html.fragment_fromstring(independent.decode(),create_parent='div')
# TOC, running page numbers, cover and repeated table headers are outside source text.
expected=normalize(''.join(ref.itertext()))
if '\ufe0e' not in raw:
    expected=expected.replace('\ufe0e','') # Pandoc can add text-presentation selector to an arrow.
article=html.fromstring(standalone.read_bytes().decode()).xpath('//article')[0]
blocks=article.xpath('.//*[@data-block-id and not(ancestor::*[@data-block-id])]')
offline=normalize(''.join(''.join(b.itertext()) for b in blocks))
doc=fitz.open(pdf)
boxes=json.loads(geometry.read_text())
assert len(boxes)==len(doc)
content=[]
embedded_fonts=set()
for page,region in zip(doc,boxes):
    sx=page.rect.width/region['width'];sy=page.rect.height/region['height']
    index=defaultdict(list)
    for x,y,r,b in region['rects']:
        rect=(x*sx-.65,y*sy-.65,r*sx+.65,b*sy+.65)
        for row in range(int(rect[1]//4),int(rect[3]//4)+1):index[row].append(rect)
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                embedded_fonts.add(span['font'])
                for c in span['chars']:
                    ch=c['c'];l,t,r,b=c['bbox'];x=(l+r)/2;y=(t+b)/2
                    if any(a<=x<=right and top<=y<=bottom for a,top,right,bottom in index[int(y//4)]):
                        content.append(ch)
actual=normalize(''.join(content))
# Default-ignorable presentation selector is retained in HTML and excluded only
# in the PDF text-layer comparison. Preserve hyphens, signs, case and digits.
exp_pdf=expected.replace('\ufe0f','')
pdf_check=check(exp_pdf,actual.replace('\ufe0f',''))
html_check=check(expected,offline)
print(json.dumps(dict(pass_=pdf_check['match'] and html_check['match'],pages=len(doc),
    sourceBlocks=len(blocks),referenceElements=len(ref),offline=html_check,pdf=pdf_check,
    fonts=sorted(embedded_fonts),method='Pandoc GFM vs source blocks and text of glyphs emitted inside original source line rectangles. NFC; whitespace is layout-dependent. FE0F excluded from PDF text comparison only.',
    **{'pass':pdf_check['match'] and html_check['match']})))

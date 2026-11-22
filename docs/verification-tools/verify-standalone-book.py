"""Strictly compare every text block, empty list marker and repeated table header on the supplied book."""
import hashlib,json,re,subprocess,sys,unicodedata
from pathlib import Path
from lxml import html
import fitz
source,pdf,receipt=map(Path,sys.argv[1:4]);raw=source.read_text(encoding='utf-8-sig')
ref=html.fragment_fromstring(subprocess.check_output(['pandoc','--from=gfm','--to=html5','--wrap=none',str(source)]).decode(),create_parent='div')
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFC',s)).replace('\ufe0f','')
def clean(e):
    s=norm(''.join(e.itertext()))
    return s if '\ufe0e' in raw else s.replace('\ufe0e','')
sha=lambda b:hashlib.sha256(b).hexdigest();doc=fitz.open(pdf)
pages=[norm(p.get_text('text',clip=fitz.Rect(0,0,p.rect.width,p.rect.height-28))) for p in doc]
text=''.join(pages);boundaries=set();length=0
for pg in pages:boundaries.add(length);length+=len(pg)
cursor=0;confirmed=0;markers=[];repeat=0;differences=[]
for ix,e in enumerate(ref):
    wanted=clean(e)
    if not wanted:
        for l in e.xpath('descendant-or-self::ol|descendant-or-self::ul'):
            items=l.xpath('./li');ordered=l.tag=='ol';back='reversed' in l.attrib
            number=int(l.get('start',str(len(items) if back else 1)))
            for item in items:
                if item.get('value') is not None:number=int(item.get('value'))
                mark=str(number)+'.' if ordered else '•'
                if not text.startswith(mark,cursor):differences.append({'block':ix,'kind':'list-marker','expected':mark,'at':cursor});break
                cursor+=len(mark);markers.append(mark);number+=-1 if back else 1
        if differences:break
        continue
    if e.tag=='table':
        head=''.join(clean(c) for c in e.xpath('.//thead//th'))
        for k,tr in enumerate(e.xpath('.//tr')):
            row=''.join(clean(x) for x in tr.xpath('./td|./th'))
            for ch in row:
                if k>0 and cursor in boundaries and head and text.startswith(head,cursor):cursor+=len(head);repeat+=1
                if cursor>=len(text) or ch!=text[cursor]:differences.append({'block':ix,'row':k,'kind':'table','at':cursor});break
                cursor+=1
            if differences:break
    elif text.startswith(wanted,cursor):cursor+=len(wanted)
    else:differences.append({'block':ix,'kind':e.tag,'at':cursor})
    if differences:break
    confirmed+=1
if cursor!=len(text):differences.append({'kind':'end','at':cursor,'actualLength':len(text)})
result={'sourceSha256':sha(source.read_bytes()),'pdfSha256':sha(pdf.read_bytes()),'pages':len(doc),'bytes':pdf.stat().st_size,'sourceBlocks':len(ref),'confirmedTextBlocks':confirmed,'exactListItems':len(markers),'listLabels':markers,'repeatedTableHeaders':repeat,'differences':differences,'pass':not differences,'method':'Independent Pandoc GFM vs every physical PDF character in reading order; NFC and layout whitespace. FE0F excluded from PDF text extraction; Pandoc-added FE0E excluded only if absent in source. Every semantic marker of every textless list in this manuscript must match its exact complete label. Only exact table headers at physical page transitions may repeat.'}
receipt.write_text(json.dumps(result,indent=2));print(json.dumps(result));sys.exit(0 if result['pass'] else 1)

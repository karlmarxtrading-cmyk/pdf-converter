"""Verify physical text ordinals and visible vector bullets against independent GFM list semantics."""
import sys,json,subprocess,hashlib
from pathlib import Path
from lxml import html
import fitz
source,pdf,positions,receipt=map(Path,sys.argv[1:5])
ref=html.fragment_fromstring(subprocess.check_output(['pandoc','--from=gfm','--to=html5',str(source)]).decode(),create_parent='div')
expected=[]
for li in ref.xpath('.//li'):
 if ''.join(li.itertext()).strip() or len(li):continue
 parent=li.getparent();items=parent.xpath('./li');number=int(parent.get('start',str(len(items)) if 'reversed' in parent.attrib else '1'))
 for entry in items:
  if entry.get('value') is not None:number=int(entry.get('value'))
  if entry==li:break
  number+=-1 if 'reversed' in parent.attrib else 1
 expected.append(str(number)+'.' if parent.tag=='ol' else '•')
positions=json.loads(positions.read_text());assert expected==[v['label'] for v in positions]
doc=fitz.open(pdf);items=[]
for want,r in zip(expected,positions):
 p=doc[r['page']-1];x=p.rect.width*r['left'];y=p.rect.height*r['top'];row={'page':r['page'],'expected':want}
 if r['ordered']:
  matched=[]
  for block in p.get_text('dict')['blocks']:
   for line in block.get('lines',[]):
    a,t,b,h=line['bbox']
    if t<=y+14 and h>=y-1 and a<=x+8:matched.append(''.join(s['text'] for s in line['spans']).strip())
  row.update(actual=matched,pass_=matched==[want])
 else:
  im=p.get_pixmap(matrix=fitz.Matrix(3,3),clip=fitz.Rect(x-26,y,x+5,y+17),colorspace=fitz.csGRAY)
  pixels=[(i%im.width,i//im.width) for i,c in enumerate(im.samples) if c<160]
  if pixels:
   xs,ys=zip(*pixels);width=max(xs)-min(xs)+1;height=max(ys)-min(ys)+1;fill=len(pixels)/(width*height)
   ok=9<=width<=15 and 9<=height<=15 and .65<=fill<=.88
   # A disc has clear outer corners while a missing-glyph box typically outlines a square.
   ink=set(pixels);ok=ok and not any((a,b) in ink for a in (min(xs),max(xs)) for b in (min(ys),max(ys)))
  else:width=height=fill=0;ok=False
  row.update(width=width,height=height,inkFraction=fill,pass_=ok)
 items.append(row)
result={'pass':bool(items) and all(i['pass_'] for i in items),'items':items,'pdfSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Exact author list ordinals in PDF glyph stream at each list item; raster ink and disc shape at each expected bullet location. Expected labels derived from independent Pandoc HTML.'}
receipt.write_text(json.dumps(result,indent=2,ensure_ascii=False));print(result['pass'],len(items))

"""Sample physical PDF pages and independently characterize the four source fixtures."""
import json, subprocess, hashlib, re
from pathlib import Path
from lxml import html
import fitz
from PIL import Image,ImageDraw
root=Path('.');dest=root/'evidence/rc12/visual';dest.mkdir(parents=True,exist_ok=True)
groups=[]
for folder in sorted(Path('examples/rc12/large').glob('*')):
    shape,toc=folder.name.rsplit('-',1);pdf=folder/'dokumen.pdf';rec=Path('evidence/rc12/large')/(folder.name+'.json')
    if not rec.exists() or not pdf.exists():continue
    source=Path('fixtures/rc9')/(shape+'-217850.md')
    report=json.loads(rec.read_text());raw=source.read_bytes()
    expected=html.fragment_fromstring(subprocess.check_output(['pandoc','--from=gfm','--to=html5','--wrap=none',str(source)]).decode(),create_parent='div')
    actual=html.fromstring((folder/'dokumen.html').read_text())
    count=lambda node:dict(tables=len(node.xpath('.//table')),rows=len(node.xpath('.//tr')),cells=len(node.xpath('.//td|.//th')),heads=len(node.xpath('.//h1|.//h2|.//h3|.//h4|.//h5|.//h6')),maxTextNode=max(len(t) for t in node.xpath('.//text()')))
    article=actual.xpath('//article')[0];content=html.Element('div')
    for node in article.xpath('.//*[@data-block-id and not(ancestor::*[@data-block-id])]'):content.append(node)
    ref=count(expected);observed=count(content)
    with fitz.open(pdf) as doc:
        # Include the transition into the authored table header if present.
        header=''.join(expected.xpath('(.//th)[1]//text()')).strip()
        firsttable=next((i for i,p in enumerate(doc) if header and header in p.get_text()),None)
        samples=sorted({0,len(doc)//4,len(doc)//2,3*len(doc)//4,len(doc)-1}|({max(firsttable-1,0),firsttable} if firsttable is not None else set()))
        thumbs=Image.new('RGB',(250*len(samples),370),'#eee');draw=ImageDraw.Draw(thumbs)
        for n,i in enumerate(samples):
            raster=doc[i].get_pixmap(matrix=fitz.Matrix(.38,.38),alpha=False)
            img=Image.frombytes('RGB',(raster.width,raster.height),raster.samples);img.thumbnail((238,342))
            thumbs.paste(img,(n*250+6,4));draw.text((n*250+6,347),f'{shape} | {i+1}/{len(doc)}',fill='black')
        thumbs.save(dest/(folder.name+'.jpg'),quality=88)
        groups.append(dict(shape=shape,toc=toc,sourceSha256=hashlib.sha256(raw).hexdigest(),sourceBytes=len(raw),sourceLines=len(raw.splitlines()),wordsApp=report.get('inputSummary',''),source=ref,html=observed,structuralMatch=all(ref[k]==observed[k] for k in ['tables','rows','cells','heads']),pdf=report.get('pdfSha256'),pages=len(doc),sampledPages=[x+1 for x in samples],tableStarts=None if firsttable is None else firsttable+1,physical=report.get('physical',{}).get('pass')))
(dest/'matrix.json').write_text(json.dumps(groups,indent=2))

"""Join complete page groups and reconstruct internal link annotations against global DOM targets."""
import json,sys,hashlib
from urllib.parse import unquote
from pathlib import Path
import fitz
folder,dest=map(Path,sys.argv[1:3]);plan=json.loads((folder/'printed.json').read_text())
geometry=json.loads((folder/'boxes.json').read_text());linkmap=json.loads((folder/'anchors.private.json').read_text());pdf=fitz.open()
for row in plan['groups']:
    fn=folder/(row['file']+'.pdf');assert hashlib.sha256(fn.read_bytes()).hexdigest()==row['pdfSha256']
    with fitz.open(fn) as part:
        assert len(part)==row['last']-row['first']+1,(row['file'],len(part));pdf.insert_pdf(part,links=False)
assert len(pdf)==plan['totalPages']==len(geometry)
def scale(page,coord):
    r=pdf[page].rect;g=geometry[page]
    return [v*(r.height/g['height'] if i%2 else r.width/g['width']) for i,v in enumerate(coord)]
added=0;missing=0;external=0
for a in linkmap['links']:
    i=a['index'];href=a['href'];rect=fitz.Rect(scale(i,a['rect']));entry={'from':rect}
    if href.startswith('#'):
        target=linkmap['targets'].get(unquote(href[1:]))
        if not target:missing+=1;continue
        j=target['index'];x,y,*_=scale(j,target['rect']);entry.update(kind=fitz.LINK_GOTO,page=j,to=fitz.Point(max(0,x),max(0,y)));added+=1
    elif href.startswith(('http://','https://','mailto:')):entry.update(kind=fitz.LINK_URI,uri=href);external+=1
    else:continue
    pdf[i].insert_link(entry)
pdf.set_metadata({'title':plan.get('title',''),'creator':'PaperForma 3.0.0-rc.9','producer':'Chromium and PyMuPDF, verified physical page groups'})
pdf.save(dest,garbage=4,deflate=True)
with fitz.open(dest) as verify:
    counts=[ln for page in verify for ln in page.get_links()]
    assert len(counts)==added+external
    assert all(0<=ln['page']<len(verify) for ln in counts if ln['kind']==fitz.LINK_GOTO)
report={'pages':len(pdf),'groups':len(plan['groups']),'restoredInternalLinks':added,'externalLinks':external,'danglingInternalLinks':missing,'source':plan['source'],'flat':plan['flat'],'pdfSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'groupOutputs':[dict(first=v['first'],last=v['last'],sha256=v['pdfSha256']) for v in plan['groups']]}
(folder/'merge.json').write_text(json.dumps(report,indent=2))

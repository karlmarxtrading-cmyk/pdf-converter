# Render each entire physical PDF page and compare it with the frozen RC7 baseline.
from pathlib import Path
import fitz, json, hashlib
r=Path('.'); m={'trigonometry-BUS-01-A4-portrait':'trigonometry-BUS-A4','trigonometry-EDU-01-A4-portrait':'trigonometry-EDU-A4','trigonometry-EDT-01-A5-portrait':'trigonometry-EDT-A5','trigonometry-CON-01-Letter-landscape':'trigonometry-CON-Letter-landscape'}
rows=[]
for a,b in m.items():
 f=r/'examples/rc12/pdf'/(a+'.pdf'); ref=r/'examples/rc7/pdf'/(b+'.pdf')
 x=fitz.open(f);y=fitz.open(ref); pages=[]
 for i,(new,old) in enumerate(zip(x,y)):
  n=new.get_pixmap(matrix=fitz.Matrix(1.2,1.2),colorspace=fitz.csGRAY,alpha=False)
  o=old.get_pixmap(matrix=fitz.Matrix(1.2,1.2),colorspace=fitz.csGRAY,alpha=False)
  pages.append({'page':i+1,'identical':n.width==o.width and n.height==o.height and n.samples==o.samples})
 rows.append({'file':str(f.relative_to(r)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'reference':str(ref.relative_to(r)),'referenceSha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'samePageCount':len(x)==len(y),'pages':pages})
 x.close();y.close()
(r/'evidence/rc12/pdf-review/reference-pages.json').write_text(json.dumps({'method':'Raster of each entire page at 86.4 DPI (72 × 1.2), PyMuPDF grayscale, including headers, TOC, numbers, equations and labels. Separate from physical-verification per-formula crops.','rows':rows},indent=2)+'\n')
print([(row['file'],sum(p['identical'] for p in row['pages']),len(row['pages'])) for row in rows])

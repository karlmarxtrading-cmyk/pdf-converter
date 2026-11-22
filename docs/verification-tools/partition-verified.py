"""Partition a fully verified print DOM along its existing physical page boundaries."""
import hashlib,json,sys
from pathlib import Path
from lxml import html,etree
source,folder,receipt=map(Path,sys.argv[1:4]);batch=int(sys.argv[4]) if len(sys.argv)>4 else 40
study=json.loads(receipt.read_text());raw=source.read_bytes();digest=lambda d:hashlib.sha256(d).hexdigest()
assert digest(raw)==study['flatSha256'] and study['layout']['verification']['status']=='pass'
folder.mkdir(parents=True,exist_ok=True)
root=html.fromstring(raw.decode());parent=root.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," pagedjs_pages ")]')[0]
pages=list(parent);assert len(pages)==study['layout']['pages'];assert not root.xpath('//script')
for p in pages:parent.remove(p)
manifest={'title':root.findtext('.//title',''),'source':study['sourceSha256'],'sourceCandidate':study['identity'],'dist':study['dist'],'flat':study['flatSha256'],'totalPages':len(pages),'groups':[]}
for first in range(0,len(pages),batch):
 group=pages[first:first+batch]; path=folder/f'part-{first+1:04}.html'
 for p in group:parent.append(p)
 path.write_bytes(etree.tostring(root,method='html',encoding='utf-8',doctype='<!doctype html>'))
 manifest['groups'].append({'file':path.name,'first':first+1,'last':first+len(group),'htmlSha256':digest(path.read_bytes())})
 for p in group:parent.remove(p)
(folder/'plan.json').write_text(json.dumps(manifest,indent=2))

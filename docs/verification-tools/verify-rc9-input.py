"""Verify the exact three input archives, all manifests, and original trig oracle."""
import hashlib,json,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def sha(data):return hashlib.sha256(data).hexdigest()
names=['RC6','RC8','audit']
want=['82e6d021c1b042a498440c0ce8957c035eb011f4c1b1fe8c16a450697a52be53','2ba9ea2114e9b3be401390eacf25dd7d68adacf85b891c91055fb5a04b9a5c18','74a30e9c03f638a2ca9791e977cf57643e3c9a6edd8857da0d7741d94bd56ee0']
out={}
for name,path,digest in zip(names,map(Path,sys.argv[1:4]),want,strict=True):
 raw=path.read_bytes();assert sha(raw)==digest
 with zipfile.ZipFile(path) as z:
  listed=[p for p in z.namelist() if not p.endswith('/')]
  assert len(listed)==len(set(listed));assert not any(p.startswith('/') or '..' in Path(p).parts for p in listed)
  check='SHA256SUMS_AUDIT.txt' if name=='audit' else 'SHA256SUMS'
  sums={p:h for h,p in (line.strip().split('  ',1) for line in z.read(check).decode().splitlines() if line.strip())}
  assert all(sha(z.read(p))==h for p,h in sums.items());assert set(listed)==set(sums)|{check}
  out[name]={'file':path.name,'sha256':digest,'size':len(raw),'members':len(listed),'verifiedChecksums':len(sums)}
with zipfile.ZipFile(sys.argv[2]) as z:
 for p in ['fixtures/rc6/user-trigonometry.md','fixtures/rc6/user-trigonometry.expected.json','examples/reference-rc6/RUMUS TRIGONOMETRI 1.html']:
  assert (root/p).read_bytes()==z.read(p)
out['status']='PASS'
(root/'evidence/rc10/input/identity.json').write_text(json.dumps(out,indent=2)+'\n')

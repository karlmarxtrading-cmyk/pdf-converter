"""Bind basic release checks to a separately extracted archive of the same candidate."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/rc12/build-tests'
def run(name,cmd):
    with (OUT/(name+'.log')).open('w') as log:
        p=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
    if p.returncode:raise RuntimeError(f'{name} failed with {p.returncode}, see {log.name}')
    return (OUT/(name+'.log')).read_text()
def main():
    if len(sys.argv)!=2:raise SystemExit('Usage: python scripts/verify-local-bundle.py ZIP')
    archive=Path(sys.argv[1]).resolve(strict=True)
    npm=shutil.which('npm')
    if not npm:raise RuntimeError('npm is required')
    OUT.mkdir(parents=True,exist_ok=True)
    clean=run('clean-build',[sys.executable,'scripts/verify-archive.py',str(archive),*(['--offline'] if os.environ.get('PF_OFFLINE')=='1' else [])])
    receipt=json.loads(clean.strip().splitlines()[-1])
    if receipt['status']!='PASS' or receipt['build']!=json.loads((ROOT/'dist.build-manifest.json').read_text()):
        raise ValueError('Detached archive contains a different candidate')
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=receipt['zipSha256']:raise ValueError('Detached ZIP digest differs')
    for key,args in [('static',['verify:static']),('http',['verify:http','--','--local']),('gate',['test:gate']),('secrets',['scan:secrets'])]:
        run(key,[npm,'run',*args])
    for name in ('http-verification-local','release-gate','secret-scan'):
        shutil.copyfile(ROOT/('evidence/'+name+'.json'),OUT/(name+'.json'))
    (OUT/'clean-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt))
if __name__=='__main__':main()

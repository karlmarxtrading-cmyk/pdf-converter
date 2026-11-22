"""Rehearse restoration of two local releases in a new, disposable Git repository.

Usage: python scripts/rehearse-rollback.py /path/to/extracted-rc9
The original releases are opened read-only. Only the temporary repository is edited.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = ('dist', 'public', 'release', 'src', 'scripts', 'tests', 'fixtures')
SOURCE_FILES = ('.gitattributes', '.gitignore', '.node-version', '.npmrc', '.oxlintrc.json',
    'index.html', 'print.html', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts',
    'package.json', 'package-lock.json', 'dist.build-manifest.json')
BASELINE = '37277f20b922b1a6a9f734b0d69e96a61a8298a6d71aad24a86fd53731178bc9'
BASE_TREE = '876bae95926bce4b4730864c66598f4192cf64c36c0ab02214dd9c3693656b0a'

def command(cwd, *args):
    return subprocess.check_output(args, cwd=cwd, stderr=subprocess.STDOUT, text=True).strip()

def install(source, target):
    for name in SOURCE_DIRS:
        if (target/name).is_dir():
            shutil.rmtree(target/name)
        shutil.copytree(source/name, target/name, ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    for name in SOURCE_FILES:
        shutil.copyfile(source/name, target/name)

def identify(directory):
    actual = json.loads(command(directory, 'node', 'scripts/fingerprint.mjs'))
    manifest = json.loads((directory/'dist.build-manifest.json').read_text())
    if any(actual[k] != manifest[k] for k in actual):
        raise ValueError(f'Source or distribution bytes differ from manifest in {directory}')
    return actual

def http_probe(directory):
    command(directory, 'node', 'scripts/verify-http.mjs','--local')
    record=json.loads((directory/'evidence/http-verification-local.json').read_text())
    if not record['pass']: raise ValueError('Local HTTP verification failed')
    return {'paths':len(record['results']),'filesCompared':record['filesCompared'],'pass':True}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('baseline',type=Path)
    args=p.parse_args()
    original=identify(args.baseline.resolve())
    if original!={'candidateSha256':BASELINE,'distTreeSha256':BASE_TREE}:
        raise ValueError('RC9 rollback target differs from the authenticated release')
    candidate=identify(ROOT)
    with tempfile.TemporaryDirectory(prefix='paperforma-rollback-') as tmp:
        trial=Path(tmp)
        command(trial,'git','init','-q')
        command(trial,'git','config','user.name','PaperForma local rehearsal')
        command(trial,'git','config','user.email','local-rehearsal@example.invalid')
        command(trial,'git','config','core.autocrlf','false')
        events=[]
        for source, name in ((args.baseline.resolve(),'prior-release'),(ROOT,'candidate-release')):
            install(source,trial)
            command(trial,'git','add','-f','-A','--',*SOURCE_FILES,*SOURCE_DIRS)
            command(trial,'git','commit','-qm',name)
            events.append({'step':name,'commit':command(trial,'git','rev-parse','HEAD'),
                'gitTree':command(trial,'git','rev-parse','HEAD^{tree}'),
                **identify(trial), 'http':http_probe(trial)})
        command(trial,'git','revert','--no-edit','HEAD')
        restored={'step':'restored','commit':command(trial,'git','rev-parse','HEAD'),
            'gitTree':command(trial,'git','rev-parse','HEAD^{tree}'),**identify(trial),'http':http_probe(trial)}
        if (restored['gitTree']!=events[0]['gitTree'] or restored['candidateSha256']!=BASELINE
                or restored['distTreeSha256']!=BASE_TREE or events[1]['distTreeSha256']!=candidate['distTreeSha256']):
            raise ValueError('Rollback target or candidate diverged during the rehearsal')
        print(json.dumps({'status':'PASS','scope':'local disposable Git repository and loopback HTTP',
            'liveCloudflareRollback':'NOT_RUN','events':[*events,restored]},indent=2))
if __name__=='__main__':
    main()

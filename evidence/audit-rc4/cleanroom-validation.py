from pathlib import Path
import zipfile,subprocess,hashlib,json,time,datetime
b=Path('/workspace/scratch/69a766e93112/paperforma_rc3_review'); source=b/'candidate'; target=b/'cleanroom-rc4-confirmed'; logdir=b/'evidence/cleanroom'
target.mkdir(exist_ok=False);logdir.mkdir(exist_ok=True)
archive=b/'validation-candidate.zip'
exclude={'node_modules','dist-qa','evidence','docs','examples'}
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(source.rglob('*')):
        rel=p.relative_to(source)
        if rel.parts[0] in exclude or any(part.startswith('.core-bench-') for part in rel.parts):continue
        if p.is_file() and not p.is_symlink():z.write(p,'repository/'+rel.as_posix())
with zipfile.ZipFile(archive) as z:z.extractall(target)
repo=target/'repository'
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'validation_archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'note':'Candidate source/dist archive reconstructed before final documentation/evidence packaging. Final ZIP source/dist identities must equal this independently rebuilt candidate.','commands':[]}
source_id=json.loads(subprocess.check_output(['node','scripts/fingerprint.mjs'],cwd=source,text=True))['candidateSha256']
stage_id=json.loads(subprocess.check_output(['node','scripts/fingerprint.mjs'],cwd=repo,text=True))['candidateSha256']
r['candidateSha256BeforeInstall']=stage_id
r['sourceInputsMatchBeforeInstall']=(source_id==stage_id)
if source_id!=stage_id:raise RuntimeError('Staged candidate fingerprint mismatch before install')
commands=[('npm-ci',['npm','ci']),('typecheck',['npm','run','typecheck']),('lint',['npm','run','lint']),('tests',['npm','test']),('build',['npm','run','build']),('http',['npm','run','verify:http','--','--local'])]
for name,cmd in commands:
    t=time.perf_counter()
    with (logdir/(name+'.log')).open('w') as f:p=subprocess.run(cmd,cwd=repo,stdout=f,stderr=subprocess.STDOUT)
    result={'name':name,'command':cmd,'exitCode':p.returncode,'seconds':round(time.perf_counter()-t,3),'log':name+'.log'}
    r['commands'].append(result);print(name,p.returncode,result['seconds'],flush=True)
    (logdir/'result.json').write_text(json.dumps(r,indent=2)+'\n')
    if p.returncode:raise SystemExit(p.returncode)
def tree(path):return {p.relative_to(path).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in path.rglob('*') if p.is_file()}
original=tree(source/'dist');rebuilt=tree(repo/'dist')
r['dist']={'expectedFiles':len(original),'rebuiltFiles':len(rebuilt),'identical':original==rebuilt,'changed':[p for p in sorted(set(original)|set(rebuilt)) if original.get(p)!=rebuilt.get(p)]}
r['source_manifest']=json.loads((source/'dist.build-manifest.json').read_text());r['cleanroom_manifest']=json.loads((repo/'dist.build-manifest.json').read_text())
r['pass']=original==rebuilt and r['source_manifest']==r['cleanroom_manifest']
(logdir/'result.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'pass':r['pass'],'dist':r['dist']},indent=2),flush=True)
raise SystemExit(0 if r['pass'] else 1)

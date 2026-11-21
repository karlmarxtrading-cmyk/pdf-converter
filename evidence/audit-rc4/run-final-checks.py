import subprocess,json,time,datetime,pathlib
repo=pathlib.Path.cwd()
out=repo.parent/'evidence/final'
out.mkdir(parents=True,exist_ok=True)
commands=[('typecheck',['npm','run','typecheck']),('lint',['npm','run','lint']),('tests',['npm','test']),('build-production',['npm','run','build']),('build-qa',['npm','run','build:qa']),('verify-static',['npm','run','verify:static']),('release-gate',['npm','run','test:gate']),('http',['npm','run','verify:http','--','--local']),('secrets',['npm','run','scan:secrets'])]
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':[]}
for name,cmd in commands:
    t=time.perf_counter()
    with (out/(name+'.log')).open('w') as f:
        p=subprocess.run(cmd,cwd=repo,stdout=f,stderr=subprocess.STDOUT)
    item={'name':name,'command':cmd,'exitCode':p.returncode,'seconds':round(time.perf_counter()-t,3),'log':name+'.log'}
    r['commands'].append(item)
    r['pass']=all(x['exitCode']==0 for x in r['commands'])
    (out/'checks.json').write_text(json.dumps(r,indent=2)+'\n')
    print(name,p.returncode,item['seconds'],flush=True)
    if p.returncode: break
fingerprint=subprocess.run(['node','scripts/fingerprint.mjs'],capture_output=True,text=True,cwd=repo)
if fingerprint.returncode==0:r['fingerprint']=json.loads(fingerprint.stdout)
(out/'checks.json').write_text(json.dumps(r,indent=2)+'\n')
raise SystemExit(0 if r['pass'] and len(r['commands'])==len(commands) else 1)

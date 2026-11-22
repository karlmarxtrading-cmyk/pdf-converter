"""Remeasure G03-G08/G11 on an explicitly selected, already-started candidate.

From the shared workspace:
  python docs/verification-tools/run-candidate-measurements.py CANDIDATE_DIR --run-id UUID --source SHA256
  python docs/verification-tools/run-candidate-measurements.py CANDIDATE_DIR --run-id UUID --source SHA256 --native

The candidate must contain the bundled verification tools and production dist.
The caller builds, creates a fresh 'start' and runs G01/G02/G09/G10/G12-G16.
This orchestrator never builds, starts acceptance, removes or copies old evidence.
Pass --native only if the G12-G14 owner has delegated the two probes for this run.
Each observation has a live command and a newly measured product. A failed
observation is retained. Independent observations still run after failure.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

P = 'evidence/rc12'
A = P+'/acceptance'
E = 'examples/rc12'
B = P+'/browser/results'
W = P+'/wrappers'
I = P+'/integrity'
D = P+'/pdf'
Y = P+'/pdf-review'
F = E+'/pdf'
TEMPLATES = ['BUS-01', 'EDU-01', 'EDT-01', 'CON-01']
HISTORICAL_RUN = '0968ffee-4f52-4980-a796-b7cc19cae40a'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--native', action='store_true')
    parser.add_argument('--chrome', default=os.environ.get('PF_CHROME') or shutil.which('chromium') or shutil.which('google-chrome'))
    args = parser.parse_args()
    root = args.candidate.resolve(strict=True)
    if not re.fullmatch(r'[0-9a-f]{64}', args.source):
        raise ValueError('Supply full candidate SHA-256')
    if args.run_id == HISTORICAL_RUN:
        raise ValueError('Refusing to modify the audited previous run')
    if not args.chrome or not Path(args.chrome).is_file():
        raise FileNotFoundError(args.chrome)

    def read(p):
        return json.loads((root/p).read_text())

    def filehash(p):
        with (root/p).open('rb') as f:
            return sha256(f.read()).hexdigest()

    def run(cmd, env=None, *, capture=False):
        print('+ '+json.dumps(cmd), flush=True)
        if capture:
            return subprocess.check_output(cmd,cwd=root,env=env,text=True)
        return subprocess.run(cmd,cwd=root,env=env).returncode

    start = read(A+'/start.json')
    state = start['identity']
    measured = json.loads(run(['node','--input-type=module','-e',
                              "import {identity} from './scripts/acceptance.mjs';console.log(JSON.stringify(identity(process.cwd())))"],capture=True))
    if (start['runId']!=args.run_id or state['candidateSha256']!=args.source or state!=measured):
        raise ValueError('Run ID or measured candidate does not match explicit selection')
    if any((root/A/'receipts'/(gate+'.json')).exists() for gate in ['G03','G04','G05','G06','G07','G08','G11']):
        raise ValueError('This orchestration expects a fresh run without earlier receipts for these gates')
    for path in ['examples/reference-rc6/RUMUS TRIGONOMETRI 1.html','examples/rc7/pdf']:
        if not (root/path).exists(): raise FileNotFoundError(root/path)

    python = os.environ.get('PF_PYTHON') or sys.executable
    python = shutil.which(python) or python
    if not Path(python).is_file(): raise FileNotFoundError(python)
    common = os.environ.copy()
    common.update(PF_CHROME=str(Path(args.chrome).resolve()),PYTHONDONTWRITEBYTECODE='1',
                  PF_INTEGRITY_EVIDENCE=I+'/acceptance.json',PF_INTEGRITY_FINAL_BYTES=I+'/final-bytes.json',
                  PF_WRAPPER_RESULT=W+'/wrapper-final.json',PF_COMPAT_RESULT=W+'/compatibility-final.json',
                  PF_PDF_DIST='dist',PF_PDF_EVIDENCE=D,PF_PDF_DIR=F,PF_PYTHON=python)
    for directory in (I,W,B,Y,F):
        (root/directory).mkdir(parents=True,exist_ok=True)
    # Each program validates the actual output. No read paths point to the prior candidate.
    jobs = {
        'trig-new':([E+'/html',B+'/trigonometry-downloads.json',B+'/oracle.json',B+'/browser-capture.json'],
                    [python,'evidence/rc12/browser/verify-trig.py']),
        'integrity-new':([I+'/acceptance.json',I+'/final-bytes.json'],
                         ['node','node_modules/vitest/vitest.mjs','run','tests/unit/render/rc8-source-integrity.test.ts','tests/unit/render/rc8-final-bytes.test.ts']),
        'wrapper-new':([W+'/wrapper-final.json',W+'/compatibility-final.json',W+'/mixed-wrappers-clipboard.html',W+'/mixed-wrappers-raw.html',W+'/wrapper-downloads.json'],
                       ['bash','-c','node node_modules/vitest/vitest.mjs run tests/unit/core/rc8-mixed-wrappers.test.ts tests/unit/core/rc8-compat-corpus.test.ts tests/unit/core/wrapper-clipboard.test.ts --reporter=dot && node tests/e2e/rc8-wrapper-download.mjs']),
        'pdf-new':([D+'/coverage.json',D+'/physical-verification.json',D+'/portrait-landscape.json',D+'/results.json',D+'/diagnostics',F],
                   ['node','tests/e2e/rc8-pdf.mjs']),
        'aggregate-new':([P+'/aggregate-tests/results.json',P+'/aggregate-tests/test.log'],['node','scripts/acceptance-selfcheck.mjs']),
        'pdf-dialogue-new':([Y+'/dialogue.json'],[python,Y+'/check-dialogue.py']),
        'pdf-mixed-new':([Y+'/mixed.json'],[python,'docs/verification-tools/check-mixed.py']),
        'pdf-reference-new':([Y+'/reference-pages.json'],[python,'docs/verification-tools/check-reference.py']),
    }
    native=[]
    if args.native:
        native=['native-dialog-new','native-seat-new']
        jobs.update({
            'native-dialog-new':([B+'/native-save.json'],['node',P+'/browser/native-probe.mjs']),
            'native-seat-new':([B+'/local-desktop-capabilities.json'],[python,'docs/verification-tools/graphical-seat.py']),
        })
    for name,(_,cmd) in jobs.items():
        if (root/A/'observations'/(name+'.json')).exists() or (root/A/'observations'/(name+'.log')).exists():
            raise ValueError('Duplicate observation name '+name)
        if cmd[0] in (python,'node') and not (root/cmd[1]).is_file():
            raise FileNotFoundError(root/cmd[1])
    rules=json.loads(run(['node','--input-type=module','-e',"import {requirements} from './scripts/acceptance-policy.mjs';console.log(JSON.stringify(requirements))"],capture=True))
    outcomes={}
    def observe(name):
        outputs,cmd=jobs[name]
        args_out=[x for p in outputs for x in ['--out',p]]
        code=run(['node','scripts/acceptance.mjs','observe',name]+args_out+['--']+cmd,common)
        outcomes[name]=code
        return code

    def bound(name,path):
        o=read(A+'/observations/'+name+'.json')
        if (outcomes.get(name)!=0 or o['runId']!=start['runId'] or o['exitCode']!=0 or o['failures'] or o['before']!=state or o['after']!=state):
            raise ValueError('Observation is not eligible: '+name)
        if path not in o['artifacts'] or filehash(path)!=o['artifacts'][path]:
            raise ValueError('Observer did not produce these exact bytes: '+path)
        return path

    # Keep the two CPU-intensive browser data collections separate. Vitest and the
    # isolated 16-gate decision controls can run while the final downloads are generated.
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(observe,n) for n in ['trig-new','integrity-new','aggregate-new']]
        for f in futures:f.result()
    observe('wrapper-new')
    pdf_ok=observe('pdf-new')==0
    if pdf_ok:
        with ThreadPoolExecutor(max_workers=2) as pool:
            fs=[pool.submit(observe,n) for n in ['pdf-dialogue-new','pdf-mixed-new','pdf-reference-new']]
            for f in fs:f.result()
    for n in native: observe(n)
    paths={g:(n,p) for g,n,p in [
        ('G03','trig-new',B+'/trigonometry-downloads.json'),('G04','wrapper-new',W+'/wrapper-final.json'),
        ('G05','integrity-new',I+'/acceptance.json'),('G06','integrity-new',I+'/acceptance.json'),
        ('G07','pdf-new',D+'/coverage.json'),('G08','pdf-new',D+'/coverage.json'),
        ('G11','aggregate-new',P+'/aggregate-tests/results.json')]}
    gates={}
    for gate,(name,data) in paths.items():
        try:
            bound(name,data)
            checks={k:{'pass':True,'evidence':data} for k in rules[gate]}
            facts={'observations':[name],'checks':checks}
            if gate=='G03':
                report=read(data)
                if report.get('status')!='PASS' or len(report['records'])!=4 or any(r['status']!='PASS' for r in report['records']):
                    raise ValueError('Frozen four-template UI download requirements failed')
                facts['html']=[bound(name,E+'/html/'+t+'.html') for t in TEMPLATES]
            if gate=='G05': checks['cssAndFonts']['evidence']=bound(name,I+'/final-bytes.json')
            if gate in ['G07','G08']:
                coverage=read(data); matrix=read(bound(name,D+'/results.json'))['results']
                if coverage['layoutSettings']!=24 or coverage['totalJobs']!=29 or not all(coverage.get(k) is True for k in rules[gate]):
                    raise ValueError('Physical matrix did not pass the bound acceptance requirements')
                facts['pdfs']=[bound(name,row['pdfPath']) for row in matrix]
                facts['artifactClasses']={r['pdfPath']:r['status'] for r in matrix}
                for row in matrix:
                    if row.get('pdfSha256') and filehash(row['pdfPath'])!=row['pdfSha256']:
                        raise ValueError('PDF byte mismatch '+row['id'])
            path=A+'/facts/'+gate+'.json'; (root/path).parent.mkdir(parents=True,exist_ok=True)
            (root/path).write_text(json.dumps(facts,ensure_ascii=False,indent=2)+'\n')
            code=run(['node','scripts/acceptance.mjs','record',gate,'PASS',path],common)
            if code: raise ValueError('Aggregate rejected the measured evidence for '+gate)
            gates[gate]='PASS'
        except Exception as exc:
            gates[gate]='FAIL'
            print(str(exc),file=sys.stderr,flush=True)
            code=run(['node','scripts/acceptance.mjs','record',gate,'FAIL','--reason',
                      f'Candidate observation {name} did not satisfy {gate}: {exc}'],common)
            if code: print('Negative receipt could not be recorded for '+gate,file=sys.stderr)
    # The supplemental visual checks retain their actual files and report discrepancies
    # even when the primary gates pass. The native probe is an availability check,
    # never an implicit native-save approval.
    supplements={}
    for n,output in [('pdf-dialogue-new',Y+'/dialogue.json'),('pdf-mixed-new',Y+'/mixed.json'),('pdf-reference-new',Y+'/reference-pages.json')]:
        if not pdf_ok: supplements[n]='NOT_RUN';continue
        if outcomes[n]!=0: supplements[n]='FAIL';continue
        result=read(bound(n,output))
        if n=='pdf-reference-new':
            passed=len(result['rows'])==4 and sum(len(r['pages']) for r in result['rows'])==74 and all(r['samePageCount'] and all(v['identical'] for v in r['pages']) for r in result['rows'])
        else:
            expected=8 if n=='pdf-dialogue-new' else 12
            rows=result.get('cases',[])
            passed=len(rows)==expected and all(row.get('pass') is True for row in rows)
        supplements[n]='PASS' if passed else 'REVIEW'
    print(json.dumps({'source':args.source,'runId':args.run_id,'gates':gates,'observationExitCodes':outcomes,'supplementaryPDF':supplements},indent=2),flush=True)
    return 0 if all(v=='PASS' for v in gates.values()) and all(c==0 for c in outcomes.values()) and all(v=='PASS' for v in supplements.values()) else 1

if __name__=='__main__':
    raise SystemExit(main())

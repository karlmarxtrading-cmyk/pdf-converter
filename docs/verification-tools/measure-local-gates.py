"""Collect RC12 local gates on an existing acceptance run, from the candidate root.

Use section "base" with the two authentic RC11 ZIPs and a detached RC12 candidate ZIP.
Use "books", "controls", "capacity" and then "record-books" for the other inspections.
G03-G08 and G11 use run-candidate-measurements.py; G09 has its own isolated protocol.
Each section retains all attempted observations. A repeat requires a new --attempt.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

E = 'evidence/rc12'
A = E + '/acceptance'
X = 'examples/rc12'
ACCEPT = ['node', 'scripts/acceptance.mjs']
BOOKS = ['original-default', 'headings-on', 'long-table-off', 'paragraphs-off',
         'paragraphs-on', 'single-paragraph-off']


def measure(args):
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
    python = env.get('PF_PYTHON') or sys.executable
    failures = []

    def run(command, **overrides):
        print('+', json.dumps(command), flush=True)
        return subprocess.run(command, env={**env, **overrides}).returncode

    def observe(label, paths, command, **overrides):
        name = label + '-' + args.attempt
        output_args = [x for path in paths for x in ('--out', path)]
        ok = run([*ACCEPT, 'observe', name, *output_args, '--', *command], **overrides) == 0
        if not ok:
            failures.append(name)
        return name, ok

    def record(gate, name, ok, mapping, **roles):
        if not ok:
            status = run([*ACCEPT, 'record', gate, 'FAIL', '--reason',
                          'Inspect current observation ' + name + ' for exit code, transcript and fresh outputs.'])
        else:
            path = Path(A, 'facts', gate + '.json')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({'observations': [name], 'checks': {
                key: {'evidence': val, 'pass': True} for key, val in mapping.items()
            }, **roles}, indent=2) + '\n', encoding='utf-8')
            status = run([*ACCEPT, 'record', gate, 'PASS', path.as_posix()])
            if status:
                run([*ACCEPT, 'record', gate, 'FAIL', '--reason',
                     'The acceptance verifier rejected the current observation ' + name + '.'])
        if status:
            failures.append(gate)

    if args.section == 'base':
        if not all((args.source,args.audit,args.candidate)):
            raise ValueError('Supply --source, --audit and --candidate archive paths')
        identity = E+'/input/identity.json'
        name, ok = observe('input', [identity], [python, 'docs/verification-tools/verify-rc12-input.py',
                                               args.source, args.audit, args.candidate])
        record('G01', name, ok, {k:identity for k in ('archivePaths','archiveChecksums','inputIdentity')})
        build = E+'/build-tests/'
        name, ok = observe('clean-build', [build.rstrip('/')], [python, 'scripts/verify-local-bundle.py',args.candidate])
        record('G02', name, ok, {**{k:build+'clean-build.log' for k in ('lockedInstall','lint','typecheck','unit')},
               'cleanBuild':build+'clean-receipt.json', 'http':build+'http-verification-local.json',
               'static':build+'static.log', 'mutations':build+'release-gate.json', 'secretScan':build+'secret-scan.json'})
    if args.section == 'books':
        for case in BOOKS:
            outputs = [E+'/book/'+case+'.json']
            if case == 'original-default':
                if not env.get('PF_PRIVATE_SOURCE') or not env.get('PF_PRIVATE_OUT'):
                    print('Original book needs PF_PRIVATE_SOURCE and PF_PRIVATE_OUT.',flush=True)
                    failures.append(case)
                    continue
            else:
                outputs.append(X+'/book/'+case)
            observe('book-'+case, outputs, ['node','docs/verification-tools/capture-product-book.mjs',case])
        html = os.path.join(env.get('PF_PRIVATE_OUT',''), 'dokumen.html')
        overrides = {'PF_PRIVATE_HTML':html} if env.get('PF_PRIVATE_OUT') and Path(html).is_file() else {}
        observe('offline-navigation', [E+'/offline/navigation.json'], ['node','docs/verification-tools/offline-navigation.mjs'], **overrides)
    if args.section == 'controls':
        Path(E,'integrity').mkdir(parents=True,exist_ok=True)
        observe('capacity-control',[E+'/accounting/capacity-validator-control.json'],['node','scripts/verify-capacity-control.mjs'])
        observe('interleaved',[E+'/integrity/interleaved.json'],['node','node_modules/vitest/vitest.mjs','run','--config',
            'docs/verification-tools/supplement.vitest.ts','docs/verification-tools/interleaved.test.ts'])
        observe('trace-control',[E+'/accounting/control-flow.json'],['node','docs/verification-tools/verify-accounting.mjs','.','.',E+'/accounting/control-flow.json'])
        observe('trace-browser',[E+'/accounting/browser.json'],['node','docs/verification-tools/repair-browser.mjs'])
        observe('ordered-lists',[E+'/ordered-lists'],['node','tests/e2e/ordered-list-proof.mjs'])
        observe('lifecycle-timing',[E+'/lifecycle/client-timing.json'],['node','docs/verification-tools/client-timing.mjs'])
        observe('lifecycle-default',[E+'/lifecycle/cancel-stages.json'],['node','docs/verification-tools/cancel-stages.mjs'])
        large = E+'/lifecycle/large-cancel.json'
        observe('lifecycle-large',[large],['node','docs/verification-tools/cancel-stages.mjs'],
                PF_LIFECYCLE_SOURCE='fixtures/rc9/paragraphs-217850.md', PF_LIFECYCLE_OUTPUT=large)
    if args.section == 'capacity':
        capacity = E+'/performance/capacity.json'
        name, ok = observe('capacity',[capacity],['node','tests/e2e/perf-matrix.mjs','--acceptance','--sizes','6,30,118','--reps','5'])
        record('G10',name,ok,{k:capacity for k in ['fiveRepetitions','measuredPages','editSla','cancelSla','memorySamples','memoryTrend']},capacity=capacity)
    if args.section == 'supplement':
        results = E+'/browser/results/'
        Path(results).mkdir(parents=True, exist_ok=True)
        for name, report in [('uat','uat.json'),('storage-operations','browser-storage.json'),('content-outputs','content-outputs.json')]:
            observe(name,[results+report],['node', E+'/browser/'+name+'.mjs'])
        observe('host-capabilities',[results+'local-desktop-capabilities.json'],[python,'docs/verification-tools/graphical-seat.py'])
        observe('headed-availability',[results+'native-save.json'],['node',E+'/browser/native-probe.mjs'])
        for name in ['ui-e2e','smoke','dependency-audit']:
            folder = '/build-tests/' if name=='dependency-audit' else '/user-suite/'
            target = E+folder+name+'.json'
            observe(name,[target],[python,'docs/verification-tools/capture-npm-result.py',name,target])
        for engine in ['firefox','webkit']:
            executable = env.get('PF_'+engine.upper()+'_EXECUTABLE')
            overrides = {'PF_ENGINE_EXECUTABLE': executable} if executable else {}
            observe('cross-'+engine,[results+'playwright-'+engine+'.json'],['node',E+'/browser/cross-engine.mjs',engine], **overrides)
    if args.section == 'record-books':
        if run(['node','scripts/record-large-gates.mjs']):
            failures.append('U')
    print(json.dumps({'section':args.section,'unsuccessfulCommands':failures}),flush=True)
    return int(bool(failures))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('section',choices=['base','books','controls','capacity','record-books','supplement'])
    parser.add_argument('--attempt',default='1')
    for flag in ('source','audit','candidate'):
        parser.add_argument('--'+flag)
    sys.exit(measure(parser.parse_args()))

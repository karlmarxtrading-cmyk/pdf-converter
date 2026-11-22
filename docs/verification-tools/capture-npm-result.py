"""Run a supplemental npm check, retaining its fresh report and original exit code."""
import argparse
from pathlib import Path
import shutil
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('check', choices=['ui-e2e','smoke','dependency-audit'])
parser.add_argument('destination', type=Path)
args = parser.parse_args()
npm = shutil.which('npm')
if not npm:
    raise SystemExit('npm missing')
args.destination.parent.mkdir(parents=True, exist_ok=True)
if args.check == 'dependency-audit':
    with args.destination.open('wb') as report:
        proc = subprocess.run([npm, 'audit', '--json'], stdout=report)
else:
    script, source_name = {'ui-e2e':('test:e2e', 'evidence/e2e-results.json'),
                           'smoke':('test:smoke','evidence/static-smoke.json')}[args.check]
    started = time.time_ns()
    proc = subprocess.run([npm, 'run', script])
    source = Path(source_name)
    if not source.is_file() or source.stat().st_mtime_ns < started or source.stat().st_size == 0:
        raise SystemExit(f'No fresh report from {script}')
    shutil.copyfile(source,args.destination)
raise SystemExit(proc.returncode)

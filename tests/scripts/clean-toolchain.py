"""Rehearse the Linux verifier with an empty HOME and a build-only PATH."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'acceptance-tests'
    if mode not in ('check', 'acceptance-tests', 'verify') or len(sys.argv) > 2:
        raise SystemExit('Usage: python3 tests/scripts/clean-toolchain.py [check|acceptance-tests|verify]')
    root = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        host_bin = work / 'bin'
        host_bin.mkdir()
        home = work / 'home'
        home.mkdir()
        for name in ('node npm sh bash install ln rm mkdir dirname basename readlink env uname awk sed sort tr '
                     'find grep xargs touch chmod cp mv cat cut head tail tar gzip stat').split():
            executable = shutil.which(name)
            if not executable:
                raise SystemExit(f'Missing build environment utility: {name}')
            (host_bin / name).symlink_to(Path(executable).resolve())
        env = {k: v for k, v in os.environ.items() if
               k.lower() in ('https_proxy', 'http_proxy', 'no_proxy', 'all_proxy') or
               k in ('SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE')}
        env.update(PATH=str(host_bin), HOME=str(home), LC_ALL='C.UTF-8', PYTHONNOUSERSITE='1')
        before = {name: shutil.which(name, path=env['PATH']) for name in
                  ('pdfinfo', 'pdftotext', 'pdffonts', 'pandoc', 'python', 'python3')}
        modules = subprocess.check_output([sys.executable, '-I', '-S', '-c',
            "from importlib.util import find_spec;print([find_spec(x) for x in ('fitz','lxml','PIL','pypdf')])"],
            env=env, text=True).strip()
        if any(before.values()) or modules != '[None, None, None, None]':
            raise RuntimeError('Test host exposes verifier tools before setup')
        print(json.dumps({'beforePath': before, 'isolatedBootstrapModules': modules, 'emptyHome': True}), flush=True)
        launcher = host_bin / 'bootstrap-python'
        launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' -I -S "$@"\n')
        launcher.chmod(0o700)
        env['PF_PYTHON'] = str(launcher)
        return subprocess.run([str(host_bin / 'node'), 'scripts/toolchain/qualified-run.mjs', mode],
                              cwd=root, env=env).returncode


if __name__ == '__main__':
    sys.exit(main())

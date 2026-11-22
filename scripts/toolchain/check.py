"""Check executable versions and exercise the real PDF/HTML parsers."""
import hashlib
from importlib.metadata import version
from importlib.util import find_spec
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

import fitz
from lxml import html
from pypdf import PdfReader


def output(args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT).decode('utf-8')


def main():
    lock_bytes = Path(__file__).with_name('linux-64.lock.json').read_bytes()
    pinned = json.loads(lock_bytes)['versions']
    observed = {name: version(name) for name in ['pymupdf', 'lxml', 'pypdf', 'pillow']}
    observed['python'] = platform.python_version()
    observed['pandoc'] = output(['pandoc', '--version']).splitlines()[0].split()[1]
    for program in ['pdfinfo', 'pdftotext', 'pdffonts']:
        observed[program] = output([program, '-v']).splitlines()[0].split()[-1]
    if len(sys.argv) == 3 and sys.argv[1] == '--prefix':
        prefix = Path(sys.argv[2]).resolve()
        origins = [sys.executable, *(shutil.which(tool) for tool in ('pdfinfo', 'pdftotext', 'pdffonts', 'pandoc')),
                   *(find_spec(module).origin for module in ('fitz', 'lxml', 'pypdf', 'PIL'))]
        if not all(path and Path(path).resolve().is_relative_to(prefix) for path in origins):
            raise ValueError('Verifier resolved executables or imports outside its new environment')
    elif len(sys.argv) != 1:
        raise SystemExit('Usage: check.py [--prefix ENV_DIRECTORY]')
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / 'probe.pdf'
        with fitz.open() as sample:
            sample.new_page().insert_text((80, 90), 'PaperForma verifier 731')
            sample.save(pdf)
        if len(PdfReader(pdf).pages) != 1 or not re.search(r'^Pages:\s+1\s*$', output(['pdfinfo', str(pdf)]), re.M):
            raise ValueError('PDF page count probe failed')
        if output(['pdftotext', '-enc', 'UTF-8', str(pdf), '-']).strip() != 'PaperForma verifier 731':
            raise ValueError('PDF text extraction probe failed')
    rendered = subprocess.check_output(['pandoc', '--from=gfm', '--to=html5'], input=b'| Left | Right |\n|---|---|\n| one | two |')
    if html.fromstring(rendered).xpath('//td/text()') != ['one', 'two']:
        raise ValueError('Pandoc/lxml table conversion probe failed')
    mismatches = {name: actual for name, actual in observed.items()
                  if actual != pinned['poppler' if name in ('pdfinfo', 'pdftotext', 'pdffonts') else name]}
    print(json.dumps({'platform': platform.platform(), 'versions': observed, 'pdfHtmlProbesPassed': True,
                      'isolatedOriginsChecked': len(sys.argv) == 3,
                      'lockSha256': hashlib.sha256(lock_bytes).hexdigest(), 'versionMismatches': mismatches}, indent=2))
    return int(bool(mismatches))


if __name__ == '__main__':
    sys.exit(main())

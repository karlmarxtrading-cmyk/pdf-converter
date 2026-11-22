"""Verify the two RC11 archives and the independent references retained by RC12."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
BASELINE = '0fc160bfbb29f668208c17f93a618b8d51810925e172f87a19580ee548159a4a'
AUDIT = '879f71e27e21a236cda77ff1669764c7e9de7d5935330c1c77fa33d5ea91a831'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_zip', type=Path)
    parser.add_argument('audit_zip', type=Path)
    parser.add_argument('candidate_zip', type=Path)
    args = parser.parse_args()
    check = runpy.run_path(str(ROOT / 'scripts/verify-inputs.py'))['check']
    source = check(args.source_zip, BASELINE, 'SHA256SUMS')
    candidate = check(args.candidate_zip, hashlib.sha256(args.candidate_zip.read_bytes()).hexdigest(), 'SHA256SUMS')
    audit = check(args.audit_zip, AUDIT, 'SHA256SUMS_AUDIT.txt')
    refs = ['fixtures/rc6/user-trigonometry.md', 'fixtures/rc6/user-trigonometry.expected.json',
            'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html']
    refs.extend(str(p.relative_to(ROOT).as_posix()) for p in sorted((ROOT/'fixtures/rc9').glob('*-217850.md')))
    refs.extend(str(p.relative_to(ROOT).as_posix()) for p in sorted((ROOT/'examples/rc7/pdf').glob('trigonometry-*.pdf')))
    hashes = {}
    with ZipFile(args.source_zip) as archive:
        for ref in refs:
            data = (ROOT / ref).read_bytes()
            if data != archive.read(ref):
                raise ValueError(f'Reference differs from authenticated RC11: {ref}')
            hashes[ref] = hashlib.sha256(data).hexdigest()
    with ZipFile(args.audit_zip) as archive:
        identity = json.loads(archive.read('05_HASIL_AUDIT_RC11.json'))['input_application']
        if identity['sha256'] != source['sha256'] or identity['files'] != source['files']:
            raise ValueError('The audit does not describe the verified baseline')
    # Evidence is collected after this detached ZIP is prepared. Compare the application
    # files and distributions themselves before binding this separate archive to a run.
    entries = runpy.run_path(str(ROOT / 'scripts/package-release.py'))['project_files']()
    def app_file(name):
        return (name.startswith('docs/verification-tools/') or name.startswith('evidence/rc12/browser/') and
                not name.startswith('evidence/rc12/browser/results/') or
                not name.startswith(('evidence/', 'examples/', 'docs/')) and name != 'SHA256SUMS')
    expected = {name: path for name, path in entries.items() if app_file(name)}
    with ZipFile(args.candidate_zip) as archive:
        if {name for name in archive.namelist() if app_file(name)} != set(expected):
            raise ValueError('Detached candidate has a different application file inventory')
        for name, path in expected.items():
            if archive.read(name) != path.read_bytes():
                raise ValueError('Different candidate bytes in detached ZIP: ' + name)
    report = {'status': 'PASS', 'source': source, 'audit': audit, 'candidateArchive': candidate,
              'matchingApplicationFiles': len(expected), 'unchangedReferenceDigests': hashes}
    path = ROOT / 'evidence/rc12/input/identity.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()

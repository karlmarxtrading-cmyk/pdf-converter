"""Check the RC10 inputs in order: RC6 ZIP, RC9 ZIP, audit ZIP, original PDF, original Markdown."""
import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'RC6': '82e6d021c1b042a498440c0ce8957c035eb011f4c1b1fe8c16a450697a52be53',
    'RC9': 'bf868821a19d0fd2bd1ef357b6ccf50d8b8ae8446ae37e01d701abee15fdf4d4',
    'audit': 'dbb7995e84756d9db6e7f9af8a2f187681ab75945114127962b1d6048c18617f',
    'privateReferencePDF': '63ce26810e162e610a8b15ca26d1cd8284bd854cb64e827295be73ab046e45ca',
    'privateSource': '88901d44a592ead82c757b65f57ce26e5f0003598a7a74064d6921439dbd0454',
}
def digest(data):
    return hashlib.sha256(data).hexdigest()

def verify_zip(path, label):
    with ZipFile(path) as z:
        names = [p.filename for p in z.infolist() if not p.is_dir()]
        manifest = 'SHA256SUMS_AUDIT.txt' if label == 'audit' else 'SHA256SUMS'
        paths = set()
        for name in names:
            key = name.casefold()
            if (key in paths or not name or chr(92) in name or name.startswith('/')
                    or ':' in name or any(v in ('', '.', '..') for v in name.split('/'))):
                raise ValueError(f'Unsafe or conflicting archive entry: {name}')
            paths.add(key)
        lines = z.read(manifest).decode().splitlines()
        seen = set()
        for line in lines:
            wanted, name = line.split('  ', 1)
            if not re.fullmatch('[a-f0-9]{64}', wanted) or name in seen or digest(z.read(name)) != wanted:
                raise ValueError(f'Invalid manifest entry: {name}')
            seen.add(name)
        if set(names) != seen | {manifest}:
            raise ValueError('Incomplete archive manifest')
        if label == 'RC9':
            for name in ['fixtures/rc6/user-trigonometry.md', 'fixtures/rc6/user-trigonometry.expected.json',
                         'examples/reference-rc6/RUMUS TRIGONOMETRI 1.html']:
                if z.read(name) != (ROOT/name).read_bytes():
                    raise ValueError('Reference mismatch: '+name)
        return {'members':len(names), 'verifiedChecksums':len(seen)}
def main():
    out = {}
    for (label, wanted), path in zip(EXPECTED.items(), map(Path, sys.argv[1:]), strict=True):
        actual = digest(path.read_bytes())
        if actual != wanted:
            raise ValueError(label+' input checksum mismatch')
        row = {'sha256':actual, 'size':path.stat().st_size}
        if label in ('RC6','RC9','audit'):
            row.update({'file':path.name}, **verify_zip(path, label))
        out[label] = row
    out['status'] = 'PASS'
    dest = ROOT/'evidence/rc10/input/identity.json'
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(out,indent=2)+'\n')
if __name__ == '__main__':
    main()
